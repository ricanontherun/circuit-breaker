import {EventEmitter} from "events";

import CircuitOptions from "./options";
import {CallResponse} from "./response";
import {CircuitState} from "./state";

const CLOSED_ERROR: Error = new Error("Circuit is closed, function not called");

interface IKeyValue {
  [key: string]: any;
}

type Callable = (...args: any[]) => Promise<any>;

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

export class CircuitBreaker extends EventEmitter {
  protected fn: Callable;
  private state: CircuitState = CircuitState.OPEN;
  private options: CircuitOptions;
  private halfOpenTimeoutHandle = null;
  private metrics: IKeyValue = {
    consecutiveFailedCalls: 0,
    consecutiveOkCalls: 0,
    halfOpenCalls: 0,
  };

  constructor(fn: Callable, options: CircuitOptions = {}) {
    super();

    this.fn = fn;
    this.options = {...defaultCircuitOptions, ...options};

    this.setState(this.options.initialState);
    this.registerCleanupHandler();
  }

  public async call(...args: any[]): Promise<any> {
    switch (this.state) {
      case CircuitState.CLOSED:
        return CLOSED_ERROR;
      case CircuitState.HALF_OPEN:
        return this.shouldMakeHalfOpenCall ? this.attemptHalfOpenCall(args) : CLOSED_ERROR;
      case CircuitState.OPEN:
        return this.attemptCall(args);
    }
  }

  public async callOrDefault(...args: any[]): Promise<any> {
    let def: any = null;
    if (args.length >= 1) {
      def = args.pop();
    }

    if (this.isClosed) {
      return def;
    }

    return this.call(args);
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

  private get shouldMakeHalfOpenCall(): boolean {
    return this.options.random(1, 100) >= this.options.halfOpenCallRate;
  }
}
