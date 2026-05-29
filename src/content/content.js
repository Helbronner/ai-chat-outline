function extractQuestions() {
  if (!chrome.runtime || !chrome.runtime.id) {
    if (typeof observer !== "undefined") {
      mutationObserver.disconnect();
    }
    return [];
  }

  const queryElements = document.querySelectorAll("user-query");

  if (queryElements.length === 0) {
    return [];
  }

  const realQuestions = [];
  queryElements.forEach((el) => {
    // Avoid "You said"
    const contentParagraphs = el.querySelectorAll("p.query-text-line");
    if (contentParagraphs.length > 0) {
      const paragraphTexts = [];

      contentParagraphs.forEach((p) => {
        const pText = p.innerText.trim();
        if (pText) paragraphTexts.push(pText);
      });

      const combinedText = paragraphTexts.join(" ");

      if (combinedText) {
        realQuestions.push(combinedText);
      }
    }
  });

  return realQuestions;
}

function handleDomMutationSync() {
  if (!chrome.runtime || !chrome.runtime.id) {
    console.log(
      "[Content] Check out context is invalid, deprecate MutationObserver",
    );

    if (typeof observer !== "undefined") {
      mutationObserver.disconnect();
    }
    return;
  }

  const latestQuestions = extractQuestions();

  chrome.runtime
    .sendMessage({
      action: "SYNC_QUESTIONS",
      data: latestQuestions,
    })
    .catch((error) => {
      console.log("Side Panel not open, Sync passed");
    });
}

const mutationObserver = new MutationObserver((mutationsList) => {
  handleDomMutationSync();
});

// Configure MutationObserver
mutationObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

/**
 * Smoothly scrolls the viewport to the target user query element.
 * * @private
 * @param {number} targetIndex - The index of the element within the node list.
 * @returns {void}
 */
function scrollToQueryElement(targetIndex) {
  const queryElements = document.querySelectorAll("user-query");

  // Defensive programming: Ensure the element exists before attempting to scroll
  if (queryElements[targetIndex]) {
    queryElements[targetIndex].scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  } else {
    console.warn(`[ContentScript] Element at index ${targetIndex} not found.`);
  }
}

/**
 * @typedef {Object} ScrollMessage
 * @property {"SCROLL_TO_QUESTION"} action
 * @property {number} index - The target element index to scroll to.
 */

/**
 * @typedef {Object} FetchMessage
 * @property {"FETCH_QUESTIONS"} action
 */

/**
 * @typedef {FetchMessage | ScrollMessage} ContentMessagePayload
 */

/**
 * Listens for messages from the extension background or popup contexts.
 * Handles DOM-specific actions like question extraction and smooth scrolling.
 * * @param {ContentMessagePayload} message - The incoming message configuration.
 * @param {chrome.runtime.MessageSender} sender - Details of the message sender.
 * @param {function(Object): void} sendResponse - Callback function to return data to the sender.
 * @returns {void} Returns nothing since all operations here are completed synchronously.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  switch (action) {
    case "FETCH_QUESTIONS": {
      const currentData = extractQuestions();
      // Synchronous response: execute directly and do not return true.
      sendResponse({ success: true, data: currentData });
      break;
    }

    case "SCROLL_TO_QUESTION": {
      // Safely cast message to ScrollMessage type for internal operations
      const targetIndex = /** @type {ScrollMessage} */ (message).index;
      scrollToQueryElement(targetIndex);
      break;
    }

    default:
      console.warn(`[ContentScript] Unhandled message action: ${action}`);
  }
});
