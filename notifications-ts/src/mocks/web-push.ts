import { test } from 'node:test';

export const setVapidDetails = test.mock.fn(() => {});
export const sendNotification = test.mock.fn(async () => {});

export const resetWebPushMocks = () => {
  setVapidDetails.mock.resetCalls();
  sendNotification.mock.resetCalls();
  sendNotification.mock.mockImplementation(async () => {});
};

test.mock.module('web-push', {
  namedExports: {
    setVapidDetails,
    sendNotification,
  }
});
