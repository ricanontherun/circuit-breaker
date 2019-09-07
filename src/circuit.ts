import { EventEmitter } from "events";

import { CircuitOptions } from "./options";
import { CallResponse } from "./response";
import { CircuitState } from "./state";
import Timer = NodeJS.Timer;

const OPEN_ERROR: Error = new Error("Circuit is open");
const HALF_OPEN_ERROR: Error = new Error("Circuit is half-open");

interface IKeyValue {
  [key: string]: any;
}

type Callable = (...args: any[]) => Promise<any>;

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

export class CircuitBreaker extends EventEmitter {
  protected fn: Callable;
  private state: CircuitState = CircuitState.CLOSED;
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
    this.options = { ...defaultCircuitOptions, ...options };

    this.setState(this.options.initialState);
    this.registerCleanupHandler();
  }

  public async call(...args: any[]): Promise<any> {
    switch (this.state) {
      case CircuitState.CLOSED:
        return this.attemptCall(args);
      case CircuitState.HALF_OPEN:
        if (!this.shouldMakeHalfOpenCall) {
          throw HALF_OPEN_ERROR;
        }

        return this.attemptHalfOpenCall(args);
      case CircuitState.OPEN:
        throw OPEN_ERROR;
    }
  }

  public async callOrDefault(...args: any[]): Promise<any> {
    let def: any = null;
    if (args.length >= 1) {
      def = args.pop();
    }

    if (this.isOpen) {
      return def;
    }

    try {
      return await this.call(args);
    } catch (err) {
      return def;
    }
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

  public reset(): CircuitBreaker {
    return this.setState(CircuitState.CLOSED);
  }

  public trip(): CircuitBreaker {
    return this.setState(CircuitState.OPEN);
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

      if (this.shouldOpen) {
        this.setState(CircuitState.OPEN);
        throw OPEN_ERROR;
      }

      return callResponse.error;
    } else {
      this.incrementSuccessful();

      if (this.shouldClose) {
        this.setState(CircuitState.CLOSED);
      }
    }

    return callResponse.response;
  }

  private async attemptCall(args: any[]): Promise<any> {
    const callResponse: CallResponse = await this.safeCall(args);

    if (!callResponse.ok) {
      this.incrementFailed();

      if (this.shouldHalfOpen) {
        this.setState(CircuitState.HALF_OPEN);
        throw HALF_OPEN_ERROR;
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

  private setState(to: CircuitState): CircuitBreaker {
    if (this.state === to) {
      return this;
    }

    const from: CircuitState = this.state;

    this.state = to;

    if (this.isOpen) {
      this.startHalfOpenTimer();
    }

    this.resetMetrics();
    this.emit("state-change", { from, to });

    return this;
  }

  private startHalfOpenTimer() {
    this.clearTimer();

    this.halfOpenTimeoutHandle = setTimeout(() => {
      this.setState(CircuitState.HALF_OPEN);
      this.halfOpenTimeoutHandle = null;
    }, this.options.halfOpenTimeout);
  }

  private get shouldClose(): boolean {
    return this.metrics.consecutiveOkCalls >= this.options.closeThreshold;
  }

  private get shouldOpen(): boolean {
    return this.metrics.consecutiveFailedCalls >= this.options.openThreshold;
  }

  private get shouldHalfOpen(): boolean {
    return this.shouldOpen;
  }

  private get shouldMakeHalfOpenCall(): boolean {
    return this.options.random(1, 100) >= this.options.halfOpenCallRate;
  }
}
