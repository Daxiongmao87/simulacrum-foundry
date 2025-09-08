// SPDX-License-Identifier: MIT
// Copyright © 2024-2025 Aaron Riechert

const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  })
);

export default mockFetch;
