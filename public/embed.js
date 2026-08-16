/**
 * The Playhouse Company, booking portal embed loader.
 *
 * Drop this onto any page of playhousecompany.com to host the booking portal:
 *
 *   <div id="playhouse-booking"></div>
 *   <script src="https://bookings.playhousecompany.com/embed.js"
 *           data-target="playhouse-booking"></script>
 *
 * Optional attributes:
 *   data-path   portal entry point (default "/embed")
 *   data-height initial height in pixels before the first resize message
 *
 * The iframe resizes itself to its content, so the host page never shows an
 * inner scrollbar. Messages from the portal are accepted only when they come
 * from the origin this script was served from.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var origin = new URL(script.src).origin;
  var targetId = script.getAttribute("data-target") || "playhouse-booking";
  var path = script.getAttribute("data-path") || "/embed";
  var initialHeight = parseInt(script.getAttribute("data-height") || "900", 10);

  function mount() {
    var container = document.getElementById(targetId);
    if (!container) {
      console.error(
        '[playhouse] No element with id "' + targetId + '" was found on the page.',
      );
      return;
    }

    var iframe = document.createElement("iframe");
    iframe.src = origin + path;
    iframe.title = "The Playhouse Company, venue bookings";
    iframe.loading = "lazy";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.height = initialHeight + "px";
    // Payment pages are opened at the top level, which requires this token.
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin allow-top-navigation-by-user-activation allow-popups",
    );
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    container.appendChild(iframe);

    window.addEventListener("message", function (event) {
      // Only trust messages from the portal we loaded.
      if (event.origin !== origin) return;
      var data = event.data;
      if (!data || data.source !== "playhouse-booking") return;

      if (data.type === "resize" && typeof data.height === "number") {
        // Guard against a zero-height flash during navigation.
        if (data.height > 100) {
          iframe.style.height = data.height + "px";
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
