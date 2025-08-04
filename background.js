let clickCount = 0;
let clickTimeout;

// Debounce utility to prevent rapid function calls
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Setup initial settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.storage.sync.set({ saveLocation: 'SnipScreen' });
    await chrome.storage.local.set({ sessionActive: true }); // Basic session flag
    showNotification('SnipScreen installed successfully', 'success');
  } catch (error) {
    console.error('Installation failed:', error);
    showNotification('Failed to initialize extension: ' + error.message, 'error');
  }
});

// Clear temporary data if the extension process is suspended
chrome.runtime.onSuspend.addListener(async () => {
  try {
    await chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode']);
  } catch (error) {
    console.error('Cleanup on suspend failed:', error);
  }
});

// Handle single/double clicks on the extension action icon
async function handleClick(tab) {
  clickCount++;

  if (clickCount === 1) {
    // Start a timer to handle as single click if no second click occurs
    clickTimeout = setTimeout(async () => {
      await handleScreenshot(tab, true); // Single-click: Crop first mode
      clickCount = 0; // Reset counter
    }, 200); // 200ms window to detect double-click
  } else if (clickCount === 2) {
    // Double click detected
    clearTimeout(clickTimeout); // Cancel single-click timer
    await handleScreenshot(tab, false); // Double-click: Full editor mode
    clickCount = 0; // Reset counter
  }
}

// Debounced function to handle screenshot capture and editor opening
const handleScreenshot = debounce(async (tab, cropOnly = false) => {
  try {
    if (!tab?.id) throw new Error('No active tab found');

    // Prevent capturing protected URLs
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('file://')) {
      throw new Error(`Cannot capture system pages (${tab.url.split('//')[0]}) or local files.`);
    }

    // Capture the visible part of the tab with high quality settings
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png', // Use PNG for lossless quality
      quality: 100   // Maximum quality (though PNG is already lossless)
    });

    if (!screenshotUrl) throw new Error('Empty screenshot captured (check permissions or page content)');

    const editorUrl = 'editor/editor.html'; // Path to the editor page

    // TODO: Consider implementing logic to find/reuse an existing editor tab

    // Create a new tab for the editor
    const newTab = await chrome.tabs.create({
        url: editorUrl,
        active: true
    });

    // Store necessary data for the editor page in local storage
    await chrome.storage.local.set({
      currentScreenshot: screenshotUrl, // The screenshot data URL
      originalTab: tab.id,           // ID of the tab where capture happened
      cropOnlyMode: cropOnly         // Flag for single-click vs double-click mode
    });

    showNotification('Screenshot captured successfully', 'success');

  } catch (error) {
    console.error('Screenshot failed:', error);
    showNotification(`Screenshot failed: ${error.message || 'Unknown error'}`, 'error');
    // Attempt to clean up storage if capture failed before editor opened
    await chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode']);
  }
}, 200); // Debounce interval

// Listener for the extension action click
chrome.action.onClicked.addListener(handleClick);

// Helper to show notifications
function showNotification(message, type = 'info') { // Default type to info
  const options = {
    type: 'basic',
    iconUrl: 'icons/icon128.png', // Relative to extension root
    title: 'SnipScreen',
    message: message,
    priority: type === 'error' ? 2 : 0, // Higher priority for errors
    requireInteraction: type === 'error' // Keep error notifications until clicked
  };

  // Use a unique ID for error notifications to prevent stacking identical ones quickly
  const notificationId = type === 'error' ? `snipscreen-error-${Date.now()}` : 'snipscreen-info';
  chrome.notifications.create(notificationId, options);
}