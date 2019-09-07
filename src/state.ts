export enum CircuitState {
  // Circuit is open, calls are not made.
  OPEN,

  // Circuit is half open, only permitting a configurable
  // percentage of calls to be made.
  HALF_OPEN,

  // Circuit is closed, all calls are made.
  CLOSED,
}
