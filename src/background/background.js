/**
 * Monitors tab updates to dynamically enable or disable the side panel.
 * Activates the side panel behavior exclusively for authorized Gemini domains
 * once the page loading status is complete.
 *
 * @param {number} tabId The integer ID of the updated tab.
 * @param {!Object} changeInfo Contains the properties that changed (e.g., status).
 * @param {!chrome.tabs.Tab} tab The full metadata of the updated tab.
 * @returns {!Promise<void>} Resolves when the side panel options are updated.
 * @listens chrome.tabs.onUpdated
 *
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Guard: Process the update event only after the page has fully loaded.
  if (changeInfo.status !== "complete") {
    return;
  }

  if (!tab.url) {
    return;
  }

  if (tab.url.includes("gemini.google.com")) {
    await chrome.sidePanel
      .setOptions({
        tabId: tabId,
        path: "sidepanel/sidepanel.html",
        enabled: true,
      })
      .catch((err) => {
        console.error("Failed to enable side panel for tab:", tabId, err);
      });
    return;
  }

  // Disables the side panel for any non-Gemini domains to restrict access.
  await chrome.sidePanel
    .setOptions({ tabId: tabId, enabled: false })
    .catch((err) => {
      console.error("Failed to disable side panel for tab:", tabId, err);
    });
});

/**
 * Handles the browser action click event to initialize the extension UI.
 * Opens the side panel natively if the active tab is verified as an
 * authorized Gemini domain.
 *
 * @param {!chrome.tabs.Tab} tab The metadata of the active tab when clicked.
 * @returns {!Promise<void>} Resolves when the side panel opens or fails.
 * @listens chrome.action.onClicked
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  // Guard: Restricts side panel initialization exclusively to the Gemini domain.
  if (!tab.url?.includes("gemini.google.com")) {
    return;
  }

  await chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    // Logs the underlying operational failure from the Chrome API.
    console.error("Side panel open skipped or failed for tab:", tab.id, err);
  });
});

/**
 * Monitors active tab changes to synchronize the side panel's state.
 * Triggers a global broadcast only when navigating between authorized
 * Gemini tabs
 *
 * @param {!Object} activeInfo Contains the integer ID of the newly activated tab.
 * @returns {!Promise<void>} Resolves when the message is processed or bypassed.
 * @listens chrome.tabs.onActivated
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!activeInfo.tabId) {
    return;
  }

  // Fetches full metadata since the activation event object only provides the tab ID.
  const tab = await chrome.tabs.get(activeInfo.tabId).catch((err) => {
    console.error(
      "Failed to retrieve tab information on activation:",
      activeInfo.tabId,
      err,
    );
  });

  // Guard: Restricts synchronization broadcasts exclusively to the Gemini domain.
  if (!tab?.url?.includes("gemini.google.com")) {
    return;
  }

  await chrome.runtime
    .sendMessage({ action: "TRIGGER_QUESTION_FETCH" })
    .catch((err) => {
      // Intentional silence:
      // If the side panel is closed, this broadcast will trigger
      // a disconnection error due to the absence of an active receiver.
      // This behavior is fully expected, so the error is muted to prevent console noise.
    });
});
