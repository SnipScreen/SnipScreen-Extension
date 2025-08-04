/**
 * Shows or hides the loading spinner element with smooth animations.
 * @param {boolean} show - True to show the spinner, false to hide it.
 */
export function showSpinner(show) {
  const spinner = document.getElementById('spinner');
  if (spinner) {
    if (show) {
      spinner.style.display = 'flex';
      // Add a small delay for smooth appearance
      requestAnimationFrame(() => {
        spinner.style.opacity = '1';
        spinner.style.transform = 'scale(1)';
      });
    } else {
      spinner.style.opacity = '0';
      spinner.style.transform = 'scale(0.8)';
      setTimeout(() => {
        spinner.style.display = 'none';
      }, 150);
    }
  }
}

/**
 * Displays a toast notification message with enhanced animations and styling.
 * @param {string} message - The message to display.
 * @param {boolean} [persist=false] - If true, the toast remains until manually hidden or another toast replaces it.
 * @param {'info' | 'success' | 'error'} [type='info'] - The type of toast, affecting its appearance and duration.
 * @returns {HTMLElement} The toast DOM element.
 */
export function showToast(message, persist = false, type = 'info') {
  // Ensure toastElement is created if it doesn't exist on 'this'
  if (!this.ui.toastElement || !document.body.contains(this.ui.toastElement)) {
    this.ui.toastElement = document.createElement('div');
    this.ui.toastElement.className = 'toast';
    document.body.appendChild(this.ui.toastElement);
  }

  // Clear any existing timeout
  if (this.ui.toastTimeout) {
    clearTimeout(this.ui.toastTimeout);
    this.ui.toastTimeout = null;
  }

  // Set message and styling based on type
  this.ui.toastElement.textContent = message;
  
  // Enhanced styling based on type
  switch (type) {
    case 'error':
      this.ui.toastElement.style.background = 'rgba(255, 59, 48, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(255, 59, 48, 0.3)';
      break;
    case 'success':
      this.ui.toastElement.style.background = 'rgba(52, 199, 89, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(52, 199, 89, 0.3)';
      break;
    default:
      this.ui.toastElement.style.background = 'rgba(28, 28, 30, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  }

  // Add icon based on type
  const iconMap = {
    'error': 'fas fa-exclamation-circle',
    'success': 'fas fa-check-circle',
    'info': 'fas fa-info-circle'
  };
  
  // Remove existing icon if any
  const existingIcon = this.ui.toastElement.querySelector('i');
  if (existingIcon) {
    existingIcon.remove();
  }
  
  // Add new icon
  const icon = document.createElement('i');
  icon.className = iconMap[type] || iconMap.info;
  icon.style.marginRight = '8px';
  this.ui.toastElement.insertBefore(icon, this.ui.toastElement.firstChild);

  // Use requestAnimationFrame to ensure the class addition triggers transition
  requestAnimationFrame(() => {
    this.ui.toastElement.classList.add('show');
    // Clear previous persistent state if any
    delete this.ui.toastElement.dataset.persistent;
    
    if (!persist) {
      const duration = type === 'error' ? 5000 : type === 'success' ? 3000 : 2500;
      this.ui.toastTimeout = setTimeout(() => {
        this.ui.toastElement.classList.remove('show');
        setTimeout(() => {
          if (this.ui.toastElement && !this.ui.toastElement.classList.contains('show')) {
            this.ui.toastElement.remove();
          }
        }, 250);
      }, duration);
    } else {
      this.ui.toastElement.dataset.persistent = 'true';
    }
  });

  return this.ui.toastElement;
}

/**
 * Adds smooth tool activation/deactivation animations.
 * @param {string} toolId - The ID of the tool to animate.
 * @param {boolean} isActive - Whether the tool is being activated or deactivated.
 */
export function animateToolActivation(toolId, isActive) {
  const toolElement = document.getElementById(toolId);
  if (!toolElement) return;

  if (isActive) {
    // Activation animation
    toolElement.style.transform = 'scale(1.1) translateY(-2px)';
    setTimeout(() => {
      toolElement.style.transform = 'scale(1.05) translateY(-1px)';
    }, 150);
  } else {
    // Deactivation animation
    toolElement.style.transform = 'scale(0.95) translateY(0px)';
    setTimeout(() => {
      toolElement.style.transform = '';
    }, 150);
  }
}

/**
 * Adds a subtle pulse animation to indicate successful actions.
 * @param {string} elementId - The ID of the element to animate.
 */
export function pulseAnimation(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.style.animation = 'pulse 0.6s ease-in-out';
  setTimeout(() => {
    element.style.animation = '';
  }, 600);
}

/**
 * Enhances the canvas with a subtle focus animation.
 * @param {boolean} focused - Whether the canvas should appear focused.
 */
export function animateCanvasFocus(focused) {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;

  if (focused) {
    canvas.style.transform = 'translateY(-3px) scale(1.01)';
    canvas.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.15)';
  } else {
    canvas.style.transform = 'translateY(-2px) scale(1)';
    canvas.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
  }
}