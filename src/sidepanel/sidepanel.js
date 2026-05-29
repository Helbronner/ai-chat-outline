/**
 * Requests the question list from the currently active browser tab.
 *
 * This function queries the active tab in the current window and sends a
 * "FETCH_QUESTIONs" message to its content script. It handles potential
 * connection errors gracefully if the content script is not yet injected.
 *
 * @async
 * @function fetchQuestions
 * @returns {Promise<void>} A Promise that resolves when the message has been sent,
 * or resolves immediately if no active tab or valid tab ID is found.
 */
async function fetchQuestions() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "FETCH_QUESTIONS",
    });

    if (response?.success && response.data) {
      renderHistory(response.data);
    }
  } catch (err) {
    // Gracefully catch expected connection errors when content script is not ready.
    console.log("Content script is not ready yet. Skipping question fetch.");
  }
}

/**
 * Handles the side panel's initialization telemetry once the DOM is fully loaded.
 *
 * This ensures that the history container elements exist in the DOM tree before
 * we attempt to fetch data and render the UI, preventing null pointer errors.
 *
 * @listens document#DOMContentLoaded
 */
function handleSidePanelLoad() {
  fetchQuestions();
}
document.addEventListener("DOMContentLoaded", handleSidePanelLoad);

/**
 * Renders the processed historical questions inside the side panel container.
 *
 * Utilizes DocumentFragment to minimize paint cycle and ensure robust
 * keyboard accessibility (A11y) for screen readers.
 *
 * @function renderHistory
 * @param {string[]} historyList Array of clean question text to render.
 * @returns {void}
 */
function renderHistory(historyList) {
  const container = document.getElementById("history-container");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const listWrapper = document.createElement("div");
  listWrapper.className = "history-list-wrapper";
  listWrapper.setAttribute("role", "list");

  /**
   * Sends a message to the active tab to scroll to the corresponding question.
   * Note: Moved outside the loop: Now a single reusable controller instead of
   * being recreated on every iteration.
   *
   * @async
   * @function dispatchScrollSignal
   * @param {number} targetIndex The index of the question to scroll to.
   * @returns {Promise<void>}
   */
  const dispatchScrollSignal = async (targetIndex) => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "SCROLL_TO_QUESTION",
        index: targetIndex,
      });
    }
  };

  const fragment = document.createDocumentFragment();

  historyList.forEach((text, index) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.textContent = text;

    // Accessibility (A11y) enhancements: Polyfill screen reader semantics
    // and keyboard navigation support for non-native interactive elements.
    item.setAttribute("role", "listitem");
    item.setAttribute("data-index", index);
    item.setAttribute("aria-label", `Question ${index + 1}`);
    item.setAttribute("tabindex", "0");

    item.addEventListener("click", () => dispatchScrollSignal(index));

    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        dispatchScrollSignal(index);
      }
    });

    fragment.appendChild(item);
  });

  listWrapper.appendChild(fragment);

  container.appendChild(listWrapper);
}

/**
 * @typedef {Object} MessagePayload
 * @property {string} action The type of message action.
 * @property {*} [data] The payload data associated with the action.
 */

/**
 * Handles the core async logic for syncing questions.
 * Validates if the message originates from the currently active tab.
 * @param {*} data The question data received from the message.
 * @param {chrome.runtime.MessageSender} sender Information about the message sender.
 * @returns {Promise<void>}
 */
async function handleSyncQuestions(data, sender) {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Verify the message comes from the currently active tab to avoid cross-tab pollution
    if (sender.tab && activeTab && sender.tab.id === activeTab.id) {
      renderHistory(data);
    } else {
      console.log("[Side Panel] Broadcast from another tab ignored.");
    }
  } catch (error) {
    console.error(
      "[Side Panel] Failed to query tabs or render history:",
      error,
    );
  }
}

/**
 * Listens for messages from the background script or other extension contexts.
 * Note: The listener itself is synchronous to prevent prematurely closing the
 * message channel via an implicit Promise return.
 * * @param {MessagePayload} message The incoming message object.
 * @param {chrome.runtime.MessageSender} sender Details about the sender.
 * @param {function} sendResponse Callback function to send a response back.
 * @returns {boolean|void} Returns true if sendResponse will be called asynchronously.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, data } = message;

  switch (action) {
    case "TRIGGER_QUESTION_FETCH":
      // Triggered when the user switches tabs or refreshes
      fetchQuestions();
      break;

    case "SYNC_QUESTIONS":
      handleSyncQuestions(data, sender);
      break;

    default:
      console.warn(`[Side Panel] Unknown message action: ${action}`);
  }
});
