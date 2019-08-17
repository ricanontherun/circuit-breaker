import {EventEmitter} from "events";

import {CircuitState} from "./state";
import {CallResponse} from "./response";

const CLOSED_ERROR: Error = new Error("Circuit is closed, function not called");
const FAILED_CANARY_ERROR: Error = new Error("Canary request failed, re-closing circuit");

interface IRandomNumberGenerator {
  (min: number, max: number): number;
}
const random = (min: number, max: number): number => Math.floor((Math.random() * min) + max);

type IKeyValue = { [key: string]: any };

class CircuitOptions {
  public failureThreshold?: number = 1;

  public successThreshold?: number = 1;

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
  private halfOpenMs: number = 0;
  private metrics: IKeyValue = {
    halfOpenCalls: 0,
    consecutiveFailedCalls: 0,
    consecutiveSuccessfulCalls: 0,
  };

  constructor(fn: Function, options: CircuitOptions = {}) {
    super();

    this.fn = fn;
    this.options = {...defaultCircuitOptions, ...options};

    this.setState(this.options.initialState);
  }

  public async call(...args: any[]): Promise<any> {
    if (this.shouldTransitionToHalfOpenState) {
      this.setState(CircuitState.HALF_OPEN);
    }

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
    this.metrics.consecutiveSuccessfulCalls = 0;
  }

  private incrementSuccessful() {
    this.metrics.consecutiveFailedCalls = 0;
    this.metrics.consecutiveSuccessfulCalls++;
  }

  private resetMetrics() {
    this.metrics.consecutiveFailedCalls = 0;
    this.metrics.consecutiveSuccessfulCalls = 0;
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

      if (this.metrics.consecutiveFailedCalls > this.options.failureThreshold) {
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
      this.halfOpenMs = Circuit.currentTimeMs + this.options.halfOpenTimeout;
    }

    this.resetMetrics();
    this.emit("state-change", {from, to});
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
    return this.metrics.consecutiveSuccessfulCalls > this.options.successThreshold;
  }

  private get shouldClose(): boolean {
    return this.metrics.consecutiveSuccessfulCalls > this.options.successThreshold;
  }

  private get shouldTransitionToHalfOpenState(): boolean {
    return this.isClosed && Circuit.currentTimeMs >= this.halfOpenMs;
  }

  private static get currentTimeMs(): number {
    return (new Date()).getTime();
  }
}

export {
  Circuit,
};
