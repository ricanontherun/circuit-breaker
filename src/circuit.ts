import {EventEmitter} from "events";

import {CircuitOptions} from "./options";
import {CallResponse} from "./response";
import {CircuitState} from "./state";
import Timer = NodeJS.Timer;

const CLOSED_ERROR: Error = new Error("Circuit is closed");
const HALF_CLOSED_ERROR: Error = new Error("Circuit is half-closed");

interface IKeyValue {
  [key: string]: any;
}

type Callable = (...args: any[]) => Promise<any>;

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

export class CircuitBreaker extends EventEmitter {
  protected fn: Callable;
  private state: CircuitState = CircuitState.OPEN;
  private options: CircuitOptions;
  private halfOpenTimeoutHandle: Timer | null = null;
  private metrics: IKeyValue = {
    consecutiveFailedCalls: 0,
    consecutiveOkCalls: 0,
    halfOpenCalls: 0,
  };

  constructor(fn: Callable, options: { [key: string]: any } = {}) {
    super();

    this.fn = fn;
    this.options = {...defaultCircuitOptions, ...options};

    this.setState(this.options.initialState);
    this.registerCleanupHandler();
  }

  public async call(...args: any[]): Promise<any> {
    switch (this.state) {
      case CircuitState.OPEN:
        return this.attemptCall(args);
      case CircuitState.HALF_OPEN:
        if (!this.shouldMakeHalfOpenCall) {
          throw HALF_CLOSED_ERROR;
        }

        return this.attemptHalfOpenCall(args);
      case CircuitState.CLOSED:
        throw CLOSED_ERROR;
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

    try {
      return await this.call(args);
    } catch (err) {
      return def;
    }
  }

  private registerCleanupHandler() {
    process
      .on("exit", this.clearTimer)
      .on("SIGINT", this.clearTimer)
      .on("SIGUSR1", this.clearTimer)
      .on("SIGUSR2", this.clearTimer);
  }

  private clearTimer() {
    if (this.halfOpenTimeoutHandle) {
      clearTimeout(this.halfOpenTimeoutHandle);
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
        throw CLOSED_ERROR;
      }

      return callResponse.error;
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

      if (this.shouldHalfClose) {
        this.setState(CircuitState.HALF_OPEN);
        throw HALF_CLOSED_ERROR;
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
    if (this.state === to) {
      return;
    }

    const from: CircuitState = this.state;

    this.state = to;

    if (this.isClosed) {
      this.startClosedTimer();
    }

    this.resetMetrics();
    this.emit("state-change", {from, to});
  }

  private startClosedTimer() {
    this.clearTimer();

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

  private get shouldHalfClose(): boolean {
    return this.shouldClose;
  }

  private get shouldMakeHalfOpenCall(): boolean {
    return this.options.random(1, 100) >= this.options.halfOpenCallRate;
  }
}
