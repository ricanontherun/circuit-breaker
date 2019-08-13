import {Circuit} from './circuit';
// Prevent failed calls to a downstream service from continuing after a certain point.

const getProfileFunction = (uid: Number) => {
  const random: number = Math.floor((Math.random() * 1) + 100);

  if (Math.trunc(random) % 2 === 0) {
    throw new Error('Fail');
  }

  return true;
};

const getProfile: Circuit = new Circuit(getProfileFunction);

getProfile.on('state-change', (from, to) => {
  console.log(`State change: ${from} -> ${to}`);
});

// Call with arbitrary arguments.
// Make sure to stash this inside call.
for (let i = 0; i < 10; i++) {
  getProfile.call(1, false).then((response) => {
    console.log(`OK: ${response}`);
  }).catch((e) => {
    console.log(`ERROR: ${e}`);
  });
}

