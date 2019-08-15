import {EventEmitter} from "events";

import {CircuitState} from "./state";
import {CallResponse} from "./response";

const CLOSED_ERROR: Error = new Error("Circuit is closed, function not called");
const FAILED_CANARY_ERROR: Error = new Error("Canary request failed, re-closing circuit");

interface IRandomizer {
  (from: number, to: number): number;
}
const random = (min: number, max: number): number => Math.floor((Math.random() * min) + max);

type IKeyValue = { [key: string]: any };

class CircuitOptions {
  public initialState?: CircuitState = CircuitState.OPEN;

  public failureThreshold?: number = 1;

  public successThreshold?: number = 1;

  public canaryRequestTimeout?: number = 60 * 1000;

  public halfOpenCallPercentage?: number = 50.0;

  public randomizer?: IRandomizer = random;
}

const defaultCircuitOptions: CircuitOptions = new CircuitOptions();

class Circuit extends EventEmitter {
  protected fn: Function;
  private state: CircuitState = CircuitState.OPEN;
  private options: CircuitOptions;
  private metrics: IKeyValue = {
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
    switch (this.state) {
      case CircuitState.CLOSED:
        return CLOSED_ERROR;
      case CircuitState.CLOSED_CANARY:
        return this.attemptCanary(args);
      case CircuitState.HALF_OPEN:
        return this.options.randomizer(1, 100) >= this.options.halfOpenCallPercentage ?
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

  private async attemptHalfOpenCall(args: any[]): Promise<any> {
    const callResponse: CallResponse = await this.safeCall(args);

    if (!callResponse.ok) {
      this.incrementFailed();

      if (this.metrics.consecutiveFailedCalls > this.options.failureThreshold) {
        this.setState(CircuitState.CLOSED);
        return CLOSED_ERROR;
      }
    } else {
      this.incrementSuccessful();

      if (this.metrics.consecutiveSuccessfulCalls > this.options.successThreshold) {
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
        // If we exceed the configured consecutive fail threshold, transition into
        // a half open state. This could help relieve pressure, without using too harsh of a policy.
        this.setState(CircuitState.HALF_OPEN);

        this.metrics.consecutiveFailedCalls = 0;

        return CLOSED_ERROR;
      }
    }

    return callResponse.response;
  }

  private async attemptCanary(args: any[]): Promise<any> {
    const canaryResponse: CallResponse = await this.safeCall(args);

    if (canaryResponse.ok) {
      this.setState(CircuitState.HALF_OPEN);
      return canaryResponse.response;
    } else {
      this.setState(CircuitState.CLOSED);
      return FAILED_CANARY_ERROR;
    }
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

  private startCanaryTimeout(): void {
    setTimeout(() => {
      this.setState(CircuitState.CLOSED_CANARY);
    }, this.options.canaryRequestTimeout);
  }

  private setState(to: CircuitState): void {
    const from: CircuitState = this.state;

    this.state = to;

    if (this.isClosed) {
      this.startCanaryTimeout();
    }

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

  public get isClosedCanary(): boolean {
    return this.state === CircuitState.CLOSED_CANARY;
  }
}

export {
  Circuit,
};
