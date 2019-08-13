import * as sinon from "sinon";
import * as chai from "chai";

import {Circuit} from "../src/circuit";
import {CircuitState} from "../src/state";

const assertOpenCircuit = (circuit) =>
  chai.assert(circuit.isOpen, "Circuit should be open");

const assertHalfOpenCircuit = (circuit) =>
  chai.assert(circuit.isHalfOpen, "Circuit should be half-open");

const callAndAssertCalled = async (circuit, spy) => {
  await circuit.call();
  chai.assert(spy.called);
};


describe("tests", () => {
  describe("state: open", () => {
    it("will call the registered function", async () => {
      const fn = sinon.spy((one, two) => {});
      const circuit = new Circuit(fn);

      await circuit.call(1, 2);

      chai.assert(fn.called, "Function should have been called");
      chai.assert(fn.calledWith(1, 2), "Function should have been called with provided arguments.");
    });

    it("will change to half-open when failed call threshold is exceeded.", async () => {
      const fn = sinon.spy(() => {
        throw new Error();
      });
      const circuit = new Circuit(fn, {
        failureThreshold: 1,
        successThreshold: 1,
      });

      // First failed call, circuit should remain open.
      assertOpenCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertOpenCircuit(circuit);

      // Second failed call should half-close the circuit.
      assertOpenCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertHalfOpenCircuit(circuit);
    });

    it("will not change to half-open if failed call threshold is not exceeded", async () => {
      const fn = sinon.spy(() => {
        throw new Error();
      });
      const circuit = new Circuit(fn, {
        failureThreshold: 1,
        successThreshold: 1,
      });

      assertOpenCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertOpenCircuit(circuit);
    });
  });
  describe("state: closed", () => {
    it("will not call the registered", async () => {
      const fn = sinon.spy();
      const circuit = new Circuit(fn, {
        initialState: CircuitState.CLOSED,
      });

      const closedError: Error = await circuit.call();

      chai.assert(fn.notCalled);
      chai.assert(closedError.message === "Circuit is closed, function not called");
    });

  });
});
