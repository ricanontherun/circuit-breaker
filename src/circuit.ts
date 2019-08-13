import {EventEmitter} from "events";

import {CircuitState} from "./state";
import {CallResponse} from "./response";

const CLOSED_ERROR: Error = new Error("Circuit is closed, function not called");
const FAILED_CANARY_ERROR: Error = new Error("Canary request failed, re-closing circuit");

const random = (min: number, max: number) => Math.floor((Math.random() * min) + max);

type IKeyValue = { [key: string]: any };

class CircuitOptions {
  public initialState?: CircuitState = CircuitState.OPEN;

  public failureThreshold?: number = 1;

  public successThreshold?: number = 1;

  public canaryRequestTimeout?: number = 60 * 1000;
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

    this.state = this.options.initialState;
    if (this.state === CircuitState.CLOSED) {
      this.startCanaryTimeout();
    }
  }

  public async call(...args: any[]): Promise<any> {
    switch (this.state) {
      case CircuitState.CLOSED:
        return CLOSED_ERROR;
      case CircuitState.CLOSED_CANARY:
        return this.attemptCanary(args);
      case CircuitState.HALF_OPEN:
        return random(1, 100) > 70.0 ? this.attemptHalfOpenCall(args) : CLOSED_ERROR;
      case CircuitState.OPEN: // Make the call.
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

      // Should we close the circuit?
      if (this.metrics.consecutiveFailedCalls > this.options.failureThreshold) {
        this.close();
        return CLOSED_ERROR;
      }
    } else {
      this.incrementSuccessful();

      // Should we open the circuit?
      if (this.metrics.consecutiveSuccessfulCalls > this.options.successThreshold) {
        this.changeState(CircuitState.OPEN);
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
        this.changeState(CircuitState.HALF_OPEN);

        this.metrics.consecutiveFailedCalls = 0;

        return CLOSED_ERROR;
      }
    }

    return callResponse.response;
  }

  private async attemptCanary(args: any[]): Promise<any> {
    const canaryResponse: CallResponse = await this.safeCall(args);

    if (canaryResponse.ok) {
      this.changeState(CircuitState.HALF_OPEN);
      return canaryResponse.response;
    } else {
      this.close();
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

  private close(): void {
    this.changeState(CircuitState.CLOSED);
    this.startCanaryTimeout();
  }

  private startCanaryTimeout(): void {
    setTimeout(() => {
      this.changeState(CircuitState.CLOSED_CANARY);
    }, this.options.canaryRequestTimeout);
  }

  private changeState(to: CircuitState): void {
    this.emit("state-change", {
      from: this.state,
      to,
    });

    this.state = to;
  }

  public getState(): CircuitState {
    return this.state;
  }
}

export {
  Circuit,
};
