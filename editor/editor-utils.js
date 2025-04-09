/**
 * Throttles a function to ensure it's called at most once within a specified time limit.
 * This version uses a regular function for the return value to correctly handle 'this' context
 * when the throttled function is called as a method of an object.
 *
 * @param {Function} func - The function to throttle.
 * @param {number} limit - The throttle time limit in milliseconds.
 * @returns {Function} - The throttled function.
 */
export function throttle(func, limit) {
  let inThrottle;        // Flag to indicate if currently within throttle period
  let lastResult;      // Optional: Stores the result of the last successful execution
  let timeoutId;       // Stores the timeout ID

  // Use a regular function here, not an arrow function, so 'this' is dynamic
  return function throttled(...args) {
    // 'this' inside this regular function will be determined by how it's called.
    const context = this; // Capture the correct 'this' context from the call site.

    if (!inThrottle) {
      // Execute the function immediately since not currently throttled
      lastResult = func.apply(context, args); // Execute with correct context and arguments
      inThrottle = true; // Set the throttle flag

      // Clear any existing timeout to reset the throttle period properly
      if (timeoutId) {
          clearTimeout(timeoutId);
      }

      // Use setTimeout to clear the throttle flag after the specified limit
      timeoutId = setTimeout(() => {
          inThrottle = false;
          timeoutId = null; // Clear the timeout ID reference
      }, limit);

    }
    // Return the result of the last successful execution (if any)
    return lastResult;
  };
}