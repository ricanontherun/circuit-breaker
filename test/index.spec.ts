import {assert, expect} from "chai";
import * as sinon from "sinon";

import {CircuitBreaker, CircuitState} from "../src";

const assertOpenCircuit = (circuit: CircuitBreaker) =>
  assert(circuit.isOpen, "CircuitBreaker should be open");

const assertHalfOpenCircuit = (circuit: CircuitBreaker) =>
  assert(circuit.isHalfOpen, "CircuitBreaker should be half-open");

const assertClosedCircuit = (circuit: CircuitBreaker) =>
  assert(circuit.isClosed, "CircuitBreaker should be closed");

const callAndAssertCalled = async (circuit: CircuitBreaker, spy: sinon.SinonSpy) => {
  await circuit.call();
  assert(spy.called);
};

const assertOpenError = (err: Error) => {
  expect(err).to.be.instanceOf(Error);
  assert(err.message === "Circuit is open");
};

const assertHalfOpenError = (err: Error) => {
  expect(err).to.be.instanceOf(Error);
  assert(err.message === "Circuit is half-open");
};

describe("tests", () => {
  describe("state: closed", () => {
    it("will call the registered function", async () => {
      const fn = sinon.spy(async (one, two) => {
        return 1;
      });
      const circuit = new CircuitBreaker(fn);

      await circuit.call(1, 2);

      assert(fn.called, "Function should have been called");
      assert(fn.calledWith(1, 2), "Function should have been called with provided arguments.");
    });

    it("callOrDefault will return whatever the function returns", async () => {
      const fn = sinon.spy(async () => {
        return 1;
      });

      const circuit = new CircuitBreaker(fn);

      const value = await circuit.callOrDefault(100);
      expect(value).to.be.equal(1);
    });

    it("will change to half-open when failed call threshold is met or exceeded", async () => {
      const fn = sinon.spy(async () => {
        throw new Error();
      });
      const circuit = new CircuitBreaker(fn, {
        closeThreshold: 2,
        openThreshold: 2,
      });

      // First failed call, circuit should remain open.
      assertClosedCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertClosedCircuit(circuit);

      // Second failed call should half-close the circuit.
      assertClosedCircuit(circuit);
      try {
        await callAndAssertCalled(circuit, fn);
        assert.fail("closed circuit should have half-closed (and thrown)");
      } catch (err) {
        assertHalfOpenCircuit(circuit);
        assertHalfOpenError(err);
      }
    });

    it("will not change to half-open if failed call threshold is not exceeded", async () => {
      const fn = sinon.spy(async () => {
        throw new Error();
      });
      const circuit = new CircuitBreaker(fn, {
        closeThreshold: 2,
        openThreshold: 2,
      });

      assertClosedCircuit(circuit);
      await callAndAssertCalled(circuit, fn);
      assertClosedCircuit(circuit);
    });
  });

  describe("state: open", () => {
    it("will not call the registered function", async () => {
      const fn = sinon.spy();
      const circuit = new CircuitBreaker(fn, {
        initialState: CircuitState.CLOSED,
      });

      try {
        await circuit.call();
      } catch (closedError) {
        // tslint:disable-next-line:no-unused-expression
        expect(fn.called).to.be.false;
        assertOpenCircuit(closedError);
      }
    });

    it("will transition to half-open after a certain period of time", async () => {
      const timeout: number = 3 * 1000;
      const fn = sinon.spy();
      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        halfOpenTimeout: timeout,
        initialState: CircuitState.OPEN,
      });

      assertOpenCircuit(circuit);

      setTimeout(async () => {
        await circuit.call();
        assertOpenCircuit(circuit);
      }, 1000);

      setTimeout(async () => {
        assertHalfOpenCircuit(circuit);
      }, timeout);
    });

    it("will return default arguments", async () => {
      const fn = sinon.spy(async () => {
        return 100;
      });
      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        initialState: CircuitState.OPEN,
      });

      expect(await circuit.callOrDefault(101)).to.be.equal(101);
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

      assertHalfOpenCircuit(circuit);
      // First call doesn't make it through the half-open circuit, so we should
      // receive the default value of 3.
      const value = await circuit.callOrDefault(2, 3);
      expect(value).to.be.equal(3);
    });

    it("will close after N consecutive successful calls", async () => {
      const fn = sinon.spy(async () => {
        return 1;
      });
      const random = sinon.stub();

      // Ensure all 3 calls make it through the half-open circuit.
      random.onFirstCall().returns(100.00);
      random.onSecondCall().returns(100.00);
      random.onThirdCall().returns(100.00);

      const circuit: CircuitBreaker = new CircuitBreaker(fn, {
        closeThreshold: 3,
        initialState: CircuitState.HALF_OPEN,
        random,
      });

      let response: number;

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      expect(fn.calledOnce).to.be.true;
      expect(response).to.be.equal(1);

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      expect(fn.calledOnce).to.be.true;
      expect(response).to.be.equal(1);

      fn.resetHistory();
      assertHalfOpenCircuit(circuit);
      response = await circuit.call();
      expect(fn.calledOnce).to.be.true;
      expect(response).to.be.equal(1);

      assertClosedCircuit(circuit);
    });

    describe("will open after N consecutive failed calls", async () => {
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
        openThreshold: 3,
        random,
      });

      it("should remain half-open after the first failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);
        await circuit.call();
        expect(fn.calledOnce).to.be.true;
      });

      it("should remain half-open after the second failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);
        await circuit.call();
        expect(fn.calledOnce).to.be.true;
      });

      it("should open after the third failed call", async () => {
        fn.resetHistory();
        assertHalfOpenCircuit(circuit);

        try {
          await circuit.call();
          assert.fail("half-open circuit should have open (and thrown)");
        } catch (err) {
          assertOpenError(err);
        }

        expect(fn.calledOnce).to.be.true;
      });

      it("should be open, function should not be called", async () => {
        fn.resetHistory();
        assertOpenCircuit(circuit);

        try {
          await circuit.call();
          assert.fail("half-open circuit should have opened (and thrown)");
        } catch (err) {
          expect(fn.called).to.be.false;

          assertOpenError(err);
        }
      });
    });
  });
});
