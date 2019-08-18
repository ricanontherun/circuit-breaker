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
  public closeAfterFailedCalls?: number = 1;

  public openAfterOkCalls?: number = 1;

  // The amount of time (milliseconds) before the circuit should
  // transition into the half-open state.
  public halfOpenTimeout?: number = 60 * 1000;

  // The percentage of calls which should be made when in the half-open state.
  public halfOpenCallRate?: number = 50.0;

  // Initial circuit state, mostly useful for tests.
  public initialState?: CircuitState = CircuitState.OPEN;

  // Random number generator used in half-open state, also useful for tests.
  public random?: IRandomNumberGenerator = random;
}

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

class Circuit extends EventEmitter {
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
    process.on("exit", this.clearTimers);
    process.on("SIGINT", this.clearTimers);
    process.on("SIGUSR1", this.clearTimers);
    process.on("SIGUSR2", this.clearTimers);
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

      if (this.metrics.consecutiveFailedCalls > this.options.closeAfterFailedCalls) {
        this.setState(CircuitState.HALF_OPEN);

        this.metrics.consecutiveFailedCalls = 0;

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
    if (this.halfOpenTimeoutHandle !== null) {
      clearTimeout(this.halfOpenTimeoutHandle);
    }

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
    return this.metrics.consecutiveOkCalls >= this.options.openAfterOkCalls;
  }

  private get shouldClose(): boolean {
    return this.metrics.consecutiveFailedCalls >= this.options.closeAfterFailedCalls;
  }
}

export {
  Circuit,
};
