import * as sinon from "sinon";
import * as chai from "chai";

import CircuitBreaker from "../src/circuit";
import {CircuitState} from "../src/state";

const assertOpenCircuit = (circuit) =>
  chai.assert(circuit.isOpen, "CircuitBreaker should be open");

const assertHalfOpenCircuit = (circuit) =>
  chai.assert(circuit.isHalfOpen, "CircuitBreaker should be half-open");

const assertClosedCircuit = (circuit) =>
  chai.assert(circuit.isClosed, "CircuitBreaker should be closed");

const callAndAssertCalled = async (circuit, spy) => {
  await circuit.call();
  chai.assert(spy.called);
};

describe("tests", () => {
  describe("state: open", () => {
    it("will call the registered function", async () => {
      const fn = sinon.spy(async (one, two) => {
        return 1;
      });
      const circuit = new CircuitBreaker(fn);

      await circuit.call(1, 2);

      chai.assert(fn.called, "Function should have been called");
      chai.assert(fn.calledWith(1, 2), "Function should have been called with provided arguments.");
    });

    it("callOrDefault will return whatever the function returns", async () => {
      const fn = sinon.spy(async () => {
        return 1;
      });

      const circuit = new CircuitBreaker(fn);

      const value = await circuit.callOrDefault(100);
      chai.expect(value).to.be.equal(1);
    });

    it("will change to half-open when failed call threshold is met or exceeded.", async () => {
      const fn = sinon.spy(async () => {
        throw new Error();
      });
      const circuit = new CircuitBreaker(fn, {
        closeThreshold: 2,
        openThreshold: 2,
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
      const fn = sinon.spy(async () => {
        throw new Error();
      });
      const circuit = new CircuitBreaker(fn, {
        closeThreshold: 2,
        openThreshold: 2,
      });

      assertOpenCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertOpenCircuit(circuit);
    });
  });

  describe("state: closed", () => {
    it("will not call the registered function", async () => {
      const fn = sinon.spy(async () => {
      });
      const circuit = new CircuitBreaker(fn, {
        initialState: CircuitState.CLOSED,
      });

      const closedError: Error = await circuit.call();

      chai.expect(fn.called).to.be.false;
      chai.expect(closedError).to.be.instanceOf(Error);
      chai.assert(closedError.message === "Circuit is closed, function not called");
    });

    it("will transition to half-open after a certain period of time", async () => {
      const timeout: number = 3 * 1000;
      const fn = sinon.spy();
      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.CLOSED,
        halfOpenTimeout: timeout,
      });

      assertClosedCircuit(circuit);

      // After 1 second, circuit should still be closed.
      setTimeout(async () => {
        await circuit.call();
        assertClosedCircuit(circuit);
      }, 1000);

      // At this point, the circuit should have changed states.
      setTimeout(async () => {
        assertHalfOpenCircuit(circuit);
      }, timeout);
    });

    it("will return default arguments", async () => {
      const fn = sinon.spy(async () => {
        return 100;
      });
      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.CLOSED,
      });

      chai.expect(await circuit.callOrDefault(101)).to.be.equal(101);
    });
  });


  describe("state: half-open", () => {
    it("will return default value if half-open call is rejected", async () => {
      const fn = sinon.spy(async () => {
        return 1;
      });
      const random = sinon.stub();

      // First call shouldn't make it through.
      random.onFirstCall().returns(49.00);

      // Second call should.
      random.onSecondCall().returns(51.00);

      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.HALF_OPEN,
        random,
      });

      const value = await circuit.call(2);
      chai.expect(value).to.be.instanceOf(Error);
    });

    it("will open after N consecutive successful calls", async () => {
      const fn = sinon.spy(async () => {
        return 1;
      });
      const random = sinon.stub();

      // Ensure all 3 calls make it through the half-open circuit.
      random.onFirstCall().returns(100.00);
      random.onSecondCall().returns(100.00);
      random.onThirdCall().returns(100.00);

      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.HALF_OPEN,
        openThreshold: 3,
        random,
      });

      let response: number;

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      chai.expect(fn.calledOnce).to.be.true;
      chai.expect(response).to.be.equal(1);

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      chai.expect(fn.calledOnce).to.be.true;
      chai.expect(response).to.be.equal(1);

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      chai.expect(fn.calledOnce).to.be.true;
      chai.expect(response).to.be.equal(1);

      assertOpenCircuit(circuit);
    });

    describe("will close after N consecutive failed calls", async () => {
      const fn = sinon.spy(async () => {
        throw new Error("uh");
      });
      const random = sinon.stub();

      // Ensure all 3 calls make it through the half-open circuit.
      random.onFirstCall().returns(100.00);
      random.onSecondCall().returns(100.00);
      random.onThirdCall().returns(100.00);

      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.HALF_OPEN,
        closeThreshold: 3,
        random,
      });

      it("should remain half-open after the first failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);
        await circuit.call();
        chai.expect(fn.calledOnce).to.be.true;
      });

      it("should remain half-open after the second failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);
        await circuit.call();
        chai.expect(fn.calledOnce).to.be.true;
      });

      it("should close after the third failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);
        await circuit.call();
        chai.expect(fn.calledOnce).to.be.true;
      });

      it("should be closed, function should not be called", async () => {
        fn.resetHistory();
        assertClosedCircuit(circuit);
        await circuit.call();
        chai.expect(fn.called).to.be.false;
      });
    });
  });
});
