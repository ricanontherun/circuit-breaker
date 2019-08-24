import {EventEmitter} from "events";

import {CircuitState} from "./state";
import {CallResponse} from "./response";

const CLOSED_ERROR: Error = new Error("Circuit is closed, function not called");

interface IRandomNumberGenerator {
  (min: number, max: number): number;
}

const random = (min: number, max: number): number => Math.floor((Math.random() * min) + max);

type IKeyValue = { [key: string]: any };

class CircuitOptions {
  // The number of thrown Errors required to close the circuit, either
  // from an open -> closed state, or a half-open -> closed state.
  public closeThreshold?: number = 1;

  // The number of successful calls required to open the circuit from a half-open state.
  public openThreshold?: number = 1;

  // When in a closed state, the amount of time (milliseconds) before the circuit will
  // transition into the half-open state.
  public halfOpenTimeout?: number = 60 * 1000;

  // When in a half-open state, the percentage of calls allowed to go through.
  public halfOpenCallRate?: number = 50.0;

  // Initial circuit state, mostly useful for tests.
  public initialState?: CircuitState = CircuitState.OPEN;

  // Random number generator used in half-open state, also useful for tests.
  public random?: IRandomNumberGenerator = random;
}

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

export default class Circuit extends EventEmitter {
  protected fn: Function;
  private state: CircuitState = CircuitState.OPEN;
  private options: CircuitOptions;
  private halfOpenTimeoutHandle = null;
  private metrics: IKeyValue = {
    halfOpenCalls: 0,
    consecutiveFailedCalls: 0,
    consecutiveOkCalls: 0,
  };

  constructor(fn: Function, options: CircuitOptions = {}) {
    super();

    this.fn = fn;
    this.options = {...defaultCircuitOptions, ...options};

    this.setState(this.options.initialState);
    this.registerCleanupHandler();
  }

  private registerCleanupHandler() {
    process
      .on("exit", this.clearTimers)
      .on("SIGINT", this.clearTimers)
      .on("SIGUSR1", this.clearTimers)
      .on("SIGUSR2", this.clearTimers);
  }

  private clearTimers() {
    clearTimeout(this.halfOpenTimeoutHandle);
  }

  public async call(...args: any[]): Promise<any> {
    switch (this.state) {
      case CircuitState.CLOSED:
        return CLOSED_ERROR;
      case CircuitState.HALF_OPEN:
        return this.options.random(1, 100) >= this.options.halfOpenCallRate ?
          this.attemptHalfOpenCall(args)
          : CLOSED_ERROR;
      case CircuitState.OPEN:
        return this.attemptCall(args);
    }
  }

  public async callOrDefault(...args: any[]) : Promise<any> {
    let def: any = null;
    if (args.length >= 1) {
      def = args.pop();
    }

    if (this.isClosed) {
      return def;
    }

    return this.call(args);
  }

  private incrementFailed() {
    this.metrics.consecutiveFailedCalls++;
    this.metrics.consecutiveOkCalls = 0;
  }

  private incrementSuccessful() {
    this.metrics.consecutiveFailedCalls = 0;
    this.metrics.consecutiveOkCalls++;
  }

  private resetMetrics() {
    this.metrics.consecutiveFailedCalls = 0;
    this.metrics.consecutiveOkCalls = 0;
  }

  private async attemptHalfOpenCall(args: any[]): Promise<any> {
    this.metrics.halfOpenCalls++;

    const callResponse: CallResponse = await this.safeCall(args);

    if (!callResponse.ok) {
      this.incrementFailed();

      if (this.shouldClose) {
        this.setState(CircuitState.CLOSED);
        return CLOSED_ERROR;
      }
    } else {
      this.incrementSuccessful();

      if (this.shouldOpen) {
        this.setState(CircuitState.OPEN);
      }
    }

    return callResponse.response;
  }

  private async attemptCall(args: any[]): Promise<any> {
    const callResponse: CallResponse = await this.safeCall(args);

    if (!callResponse.ok) {
      this.incrementFailed();

      if (this.shouldClose) {
        this.setState(CircuitState.HALF_OPEN);

        return CLOSED_ERROR;
      }
    }

    return callResponse.response;
  }

  private async safeCall(args: any[]): Promise<CallResponse> {
    const response = new CallResponse();

    try {
      response.response = await this.fn.apply(null, args);
    } catch (e) {
      response.ok = false;
      response.error = e;
    }

    return response;
  }

  private setState(to: CircuitState): void {
    const from: CircuitState = this.state;

    this.state = to;

    if (this.isClosed) {
      this.startClosedTimer();
    }

    this.resetMetrics();
    this.emit("state-change", {from, to});
  }

  private startClosedTimer() {
    clearTimeout(this.halfOpenTimeoutHandle);

    this.halfOpenTimeoutHandle = setTimeout(() => {
      this.setState(CircuitState.HALF_OPEN);
      this.halfOpenTimeoutHandle = null;
    }, this.options.halfOpenTimeout);
  }

  public get isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  public get isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  public get isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  private get shouldOpen(): boolean {
    return this.metrics.consecutiveOkCalls >= this.options.openThreshold;
  }

  private get shouldClose(): boolean {
    return this.metrics.consecutiveFailedCalls >= this.options.closeThreshold;
  }
}
