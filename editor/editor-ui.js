/**
 * Shows or hides the loading spinner element.
 * @param {boolean} show - True to show the spinner, false to hide it.
 */
export function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (spinner) {
      spinner.style.display = show ? 'flex' : 'none';
    }
  }
  
  /**
   * Displays a toast notification message.
   * @param {string} message - The message to display.
   * @param {boolean} [persist=false] - If true, the toast remains until manually hidden or another toast replaces it.
   * @param {'info' | 'success' | 'error'} [type='info'] - The type of toast, affecting its appearance and duration.
   * @returns {HTMLElement} The toast DOM element.
   */
  export function showToast(message, persist = false, type = 'info') {
    // Ensure toastElement is created if it doesn't exist on 'this'
    if (!this.toastElement || !document.body.contains(this.toastElement)) {
        this.toastElement = document.createElement('div');
        this.toastElement.className = 'toast';
        document.body.appendChild(this.toastElement);
    }
  
    this.toastElement.textContent = message;
    this.toastElement.style.background = type === 'error' ? 'rgba(255, 59, 48, 0.9)' :
                                        type === 'success' ? 'rgba(52, 199, 89, 0.9)' :
                                        'rgba(50, 50, 50, 0.9)';
  
    // Use requestAnimationFrame to ensure the class addition triggers transition
    requestAnimationFrame(() => {
        this.toastElement.classList.add('show');
        // Clear previous persistent state if any
        delete this.toastElement.dataset.persistent;
        if (this.toastTimeout) clearTimeout(this.toastTimeout);
  
        if (!persist) {
            const duration = type === 'error' ? 5000 : 2500;
            this.toastTimeout = setTimeout(() => {
                this.toastElement.classList.remove('show');
            }, duration);
        } else {
            this.toastElement.dataset.persistent = 'true';
        }
    });
  
    return this.toastElement; // Return the element
  }