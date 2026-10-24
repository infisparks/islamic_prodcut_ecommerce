/**
 * Social proof & recent purchases popup notification: Disabled.
 */
(function () {
    'use strict';
    // Remove any existing toast or styles if present in the DOM
    const existingToast = document.getElementById('recent-purchase-toast');
    if (existingToast && existingToast.parentNode) {
        existingToast.parentNode.removeChild(existingToast);
    }
    const existingStyles = document.getElementById('recent-purchase-styles');
    if (existingStyles && existingStyles.parentNode) {
        existingStyles.parentNode.removeChild(existingStyles);
    }
})();
