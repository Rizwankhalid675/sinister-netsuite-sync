/*!
 * sd2-motion.js
 * Lightweight, dependency-free scroll-reveal + 3D tilt engine for Sinister Diesel V2.
 * Respects prefers-reduced-motion. No external libraries required.
 */
(function () {
    "use strict";

    var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    function shouldReduce() {
        return !!(reduceQuery && reduceQuery.matches);
    }

    /* Apply the shared motion language to active V2 pages and to catalog
       fragments injected after load. Interactive controls and carousel
       internals are intentionally excluded so Miva behavior stays native. */
    function enhancePage(root) {
        root = root || document;

        var revealSelectors = [
            ".sd2-v2-search-page__head",
            ".sd2-v2-search-page__results",
            ".sd2-v2-filter-rail",
            ".sd2-v2-product-hero",
            ".sd2-v2-fitment-confirm",
            ".sd2-v2-pdp__media",
            ".sd2-v2-buybox",
            ".sd2-v2-product-tabs",
            ".sd2-v2-pdp-section",
            ".sd2-v2-checkout-hero",
            ".sd2-v2-cart-page__main > *",
            ".sd2-v2-order-summary",
            ".sd2-v2-checkout-panel",
            ".sd2-v2-auth__panel",
            ".sd2-v2-account-hero",
            ".sd2-v2-account-nav",
            ".sd2-v2-account-card",
            ".sd2-v2-static-page__main",
            ".sd2-v2-static-page__aside",
            ".sd2-v2-help-notices",
            ".sd2-v2-help-embed-wrap",
            ".sd2-v2-offers-hero",
            ".sd2-v2-offers-note",
            ".sd2-v2-footer__log-head",
            ".sd2-v2-footer__main",
            ".sd2-v3-process__intro",
            ".sd2-v3-process-card",
            ".sd2-v3-auth-story",
            ".sd2-v3-hero-data",
            ".sd2-v3-footer-cta",
            ".sd2-v3-cart-assurance",
            ".sd-warranty-hero",
            ".sd-warranty-content > .sd-section"
        ];
        var staggerSelectors = [
            ".sd2-v2-checkout-steps",
            ".sd2-v2-account-actions",
            ".sd2-v2-review-preview",
            ".sd2-v2-pdp-build-grid",
            ".sd2-v2-help-grid",
            ".sd2-v2-offers-grid",
            ".sd2-v2-footer__log-grid"
        ];
        var tiltSelectors = [
            ".sd2-v2-product-card",
            ".sd2-v2-cart-item",
            ".sd2-v2-account-card",
            ".sd2-v2-search-suggestions__block",
            ".sd2-v2-help-card",
            ".sd2-v2-offer-card",
            ".sd2-v2-footer__log-card"
        ];

        root.querySelectorAll(revealSelectors.join(",")).forEach(function (el) {
            el.classList.add("sd2-reveal");
        });
        root.querySelectorAll(".sd2-v2-pdp__media").forEach(function (el) {
            el.classList.add("sd2-reveal--left");
        });
        root.querySelectorAll(".sd2-v2-buybox").forEach(function (el) {
            el.classList.add("sd2-reveal--right");
        });
        root.querySelectorAll(staggerSelectors.join(",")).forEach(function (el) {
            el.classList.add("sd2-stagger");
        });
        root.querySelectorAll(tiltSelectors.join(",")).forEach(function (el) {
            el.classList.add("sd2-tilt");
        });
    }

    /* ---------------------------------------------------------
     * 1. Scroll reveal (IntersectionObserver)
     *    Usage: add class "sd2-reveal" to any element.
     *    Optional data-reveal-delay="120" (ms) for stagger.
     * --------------------------------------------------------- */
    function initReveal() {
        var els = Array.prototype.filter.call(
            document.querySelectorAll(".sd2-reveal, .sd2-stagger"),
            function (el) { return el.getAttribute("data-sd2-reveal-bound") !== "true"; }
        );
        if (!els.length) return;

        els.forEach(function (el) { el.setAttribute("data-sd2-reveal-bound", "true"); });

        if (shouldReduce() || !("IntersectionObserver" in window)) {
            els.forEach(function (el) { el.classList.add("is-visible"); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var el = entry.target;
                    var delay = el.getAttribute("data-reveal-delay");
                    if (delay) {
                        el.style.transitionDelay = delay + "ms";
                    }
                    el.classList.add("is-visible");
                    io.unobserve(el);
                }
            });
        }, {
            root: null,
            rootMargin: "0px 0px -8% 0px",
            threshold: 0.12
        });

        els.forEach(function (el) { io.observe(el); });
    }

    /* ---------------------------------------------------------
     * 2. 3D tilt (pointer-driven perspective tilt)
     *    Usage: add class "sd2-tilt" to any element.
     *    Optional data-tilt-max="10" (degrees), data-tilt-scale="1.02"
     * --------------------------------------------------------- */
    function initTilt() {
        if (shouldReduce()) return;
        var els = document.querySelectorAll(".sd2-tilt");
        if (!els.length) return;

        var supportsFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
        if (!supportsFinePointer) return;

        els.forEach(function (el) {
            if (el.getAttribute("data-sd2-tilt-bound") === "true") return;
            el.setAttribute("data-sd2-tilt-bound", "true");

            var maxTilt = parseFloat(el.getAttribute("data-tilt-max")) || 4;
            var scale = parseFloat(el.getAttribute("data-tilt-scale")) || 1.006;
            var rafId = null;
            var rect = null;

            function onEnter() {
                rect = el.getBoundingClientRect();
                el.classList.add("is-tilting");
            }

            function onMove(e) {
                if (!rect) rect = el.getBoundingClientRect();
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(function () {
                    var px = (e.clientX - rect.left) / rect.width;
                    var py = (e.clientY - rect.top) / rect.height;
                    var rx = (0.5 - py) * maxTilt;
                    var ry = (px - 0.5) * maxTilt;
                    el.style.transform =
                        "perspective(900px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" +
                        ry.toFixed(2) + "deg) scale3d(" + scale + "," + scale + "," + scale + ")";
                });
            }

            function onLeave() {
                if (rafId) cancelAnimationFrame(rafId);
                el.classList.remove("is-tilting");
                el.style.transform = "";
                rect = null;
            }

            el.addEventListener("pointerenter", onEnter, { passive: true });
            el.addEventListener("pointermove", onMove, { passive: true });
            el.addEventListener("pointerleave", onLeave, { passive: true });
        });
    }

    /* ---------------------------------------------------------
     * 3. Parallax layers (subtle scroll-linked translate)
     *    Usage: add class "sd2-parallax" with data-parallax-speed="0.15"
     * --------------------------------------------------------- */
    function initParallax() {
        if (shouldReduce()) return;
        var layers = document.querySelectorAll(".sd2-parallax");
        if (!layers.length) return;

        var ticking = false;

        function update() {
            var vh = window.innerHeight;
            layers.forEach(function (el) {
                var speed = parseFloat(el.getAttribute("data-parallax-speed")) || 0.12;
                var rect = el.getBoundingClientRect();
                var center = rect.top + rect.height / 2;
                var offset = (center - vh / 2) * speed * -1;
                offset = Math.max(-48, Math.min(48, offset));
                el.style.transform = "translate3d(0," + offset.toFixed(1) + "px,0)";
            });
            ticking = false;
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });
        update();
    }

    /* ---------------------------------------------------------
     * 4. Scroll-linked depth scenes
     *    A scene owns dedicated child layers so depth transforms never
     *    overwrite reveal or pointer-tilt transforms on the parent.
     * --------------------------------------------------------- */
    function initDepthScenes() {
        if (shouldReduce()) return;
        var scenes = document.querySelectorAll(".sd2-depth-scene");
        if (!scenes.length) return;

        var ticking = false;

        function update() {
            var vh = window.innerHeight || document.documentElement.clientHeight;
            scenes.forEach(function (scene) {
                var rect = scene.getBoundingClientRect();
                if (rect.bottom < -120 || rect.top > vh + 120) return;

                var travel = Math.max(vh + rect.height, 1);
                var progress = ((vh * 0.5) - (rect.top + rect.height * 0.5)) / travel;
                progress = Math.max(-0.62, Math.min(0.62, progress));

                scene.querySelectorAll("[data-sd2-depth]").forEach(function (layer) {
                    var depth = parseFloat(layer.getAttribute("data-sd2-depth"));
                    if (!isFinite(depth)) depth = 0.08;
                    var y = progress * depth * 220;
                    var z = Math.abs(depth) * 42;
                    var rx = progress * depth * -5;
                    layer.style.setProperty("--sd2-depth-y", y.toFixed(2) + "px");
                    layer.style.setProperty("--sd2-depth-z", z.toFixed(2) + "px");
                    layer.style.setProperty("--sd2-depth-rx", rx.toFixed(3) + "deg");
                });
            });
            ticking = false;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }

        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate, { passive: true });
        update();
    }

    /* ---------------------------------------------------------
     * 5. Cinematic page shell
     *    Discovers the shared V2 page vocabulary and adds the visual
     *    hooks used by every route. No Miva form or commerce markup is
     *    replaced; this is a progressive-enhancement boundary only.
     * --------------------------------------------------------- */
    function initCinematicShell() {
        var pageRoot = document.querySelector([
            ".sd2-v2-home",
            ".sd2-v2-search-page",
            ".sd2-v2-pdp",
            ".sd2-v2-cart-page",
            ".sd2-v2-checkout",
            ".sd2-v2-account",
            ".sd2-v2-auth",
            ".sd2-v2-help-center",
            ".sd2-v2-offers-page",
            ".sd-warranty-wrap"
        ].join(","));
        if (!pageRoot) return;

        document.documentElement.classList.add("sd2-motion-ready");
        pageRoot.classList.add("sd2-cinema-page");

        var kind = "content";
        if (pageRoot.classList.contains("sd2-v2-home")) kind = "home";
        else if (pageRoot.classList.contains("sd2-v2-pdp")) kind = "product";
        else if (pageRoot.classList.contains("sd2-v2-cart-page")) kind = "cart";
        else if (pageRoot.classList.contains("sd2-v2-checkout")) kind = "checkout";
        else if (pageRoot.classList.contains("sd2-v2-account")) kind = "account";
        else if (pageRoot.classList.contains("sd2-v2-auth")) kind = "account";
        else if (pageRoot.classList.contains("sd2-v2-help-center")) kind = "help";
        else if (pageRoot.classList.contains("sd-warranty-wrap")) kind = "content";
        else if (pageRoot.hasAttribute("data-v2-listing-page") || pageRoot.hasAttribute("data-v2-category-hub") || pageRoot.hasAttribute("data-v2-engine-hub")) kind = "catalog";
        else if (pageRoot.querySelector("[data-v2-search-results-header]")) kind = "search";
        pageRoot.setAttribute("data-sd2-page-kind", kind);

        var heroSelectors = [
            ".sd2-v2-search-page__head",
            ".sd2-v2-product-hero",
            ".sd2-v2-checkout-hero",
            ".sd2-v2-offers-hero",
            ".sd2-v2-hub-intro",
            ".sd-warranty-hero"
        ];
        pageRoot.querySelectorAll(heroSelectors.join(",")).forEach(function (hero) {
            hero.classList.add("sd2-cinema-hero");
            var title = hero.querySelector("h1");
            if (title) title.classList.add("sd2-cinema-title");
        });

        pageRoot.querySelectorAll(".sd2-v2-account-hero").forEach(function (hero) {
            hero.classList.add("sd2-cinema-account-head");
            var title = hero.querySelector("h1");
            if (title) title.classList.add("sd2-cinema-title");
        });

        var sectionSelectors = [
            ".sd2-v2-pdp-section",
            ".sd2-v2-checkout-panel",
            ".sd2-v2-account-card",
            ".sd2-v2-auth__panel",
            ".sd2-v2-help-grid",
            ".sd2-v2-offers-grid",
            ".sd2-v2-static-page__main",
            ".sd2-v2-cart-page__main > *",
            ".sd-warranty-content > .sd-section"
        ];
        var sectionNumber = 0;
        pageRoot.querySelectorAll(sectionSelectors.join(",")).forEach(function (section) {
            if (section.hasAttribute("data-sd2-cinema-section")) return;
            sectionNumber += 1;
            section.setAttribute("data-sd2-cinema-section", (sectionNumber < 10 ? "0" : "") + sectionNumber);
            section.classList.add("sd2-cinema-section");
        });

        var mediaSelectors = [
            ".sd2-v2-pdp-gallery",
            ".sd2-v2-product-card__media",
            ".sd2-v2-platform-card",
            ".sd2-v2-build-story__media",
            ".sd2-v2-footer__log-card",
            ".sd2-v2-mega__hero"
        ];
        document.querySelectorAll(mediaSelectors.join(",")).forEach(function (media) {
            media.classList.add("sd2-cinema-media");
        });

        if (kind !== "home" && !document.querySelector(".sd2-page-arrival")) {
            var arrival = document.createElement("div");
            arrival.className = "sd2-page-arrival";
            arrival.setAttribute("aria-hidden", "true");
            arrival.innerHTML = "<span>Sinister Diesel</span>";
            document.body.appendChild(arrival);
        }

        if (!document.querySelector(".sd2-scroll-progress")) {
            var progress = document.createElement("div");
            progress.className = "sd2-scroll-progress";
            progress.setAttribute("aria-hidden", "true");
            progress.innerHTML = "<span></span>";
            document.body.appendChild(progress);
        }
    }

    /* ---------------------------------------------------------
     * 6. Scroll telemetry + adaptive header
     * --------------------------------------------------------- */
    function initScrollTelemetry() {
        if (document.documentElement.getAttribute("data-sd2-scroll-bound") === "true") return;
        document.documentElement.setAttribute("data-sd2-scroll-bound", "true");
        var progress = document.querySelector(".sd2-scroll-progress span");
        var header = document.querySelector("[data-v2-sticky-header]");
        var cinemaPage = document.querySelector(".sd2-cinema-page");
        var ticking = false;

        function update() {
            var top = window.pageYOffset || document.documentElement.scrollTop || 0;
            var max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
            var ratio = Math.max(0, Math.min(1, top / max));
            document.documentElement.style.setProperty("--sd2-page-progress", (ratio * 100).toFixed(3) + "%");
            if (cinemaPage) {
                var routeProgress = Math.max(0, Math.min(1, top / Math.max(window.innerHeight * 0.78, 1)));
                cinemaPage.style.setProperty("--v4-route-progress", routeProgress.toFixed(4));
            }
            if (progress) progress.style.width = (ratio * 100).toFixed(3) + "%";
            if (header) header.classList.toggle("is-scrolled", top > 24);
            ticking = false;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate, { passive: true });
        update();
    }

    /* ---------------------------------------------------------
     * 7. Pointer light + restrained magnetic CTAs
     * --------------------------------------------------------- */
    function initPointerDetail() {
        if (shouldReduce() || !(window.matchMedia && window.matchMedia("(pointer: fine)").matches)) return;

        document.querySelectorAll([
            ".sd2-v2-product-card",
            ".sd2-v2-buybox",
            ".sd2-v2-order-summary",
            ".sd2-v2-account-card",
            ".sd2-v2-auth__panel",
            ".sd2-v2-help-card",
            ".sd2-v2-offer-card"
        ].join(",")).forEach(function (card) {
            if (card.getAttribute("data-sd2-light-bound") === "true") return;
            card.setAttribute("data-sd2-light-bound", "true");
            card.classList.add("sd2-pointer-light");
            card.addEventListener("pointermove", function (event) {
                var rect = card.getBoundingClientRect();
                card.style.setProperty("--sd2-pointer-x", (event.clientX - rect.left).toFixed(1) + "px");
                card.style.setProperty("--sd2-pointer-y", (event.clientY - rect.top).toFixed(1) + "px");
            }, { passive: true });
        });

        document.querySelectorAll(".sd2-btn:not(.sd2-btn--compact)").forEach(function (button) {
            if (button.getAttribute("data-sd2-magnet-bound") === "true") return;
            button.setAttribute("data-sd2-magnet-bound", "true");
            button.classList.add("sd2-magnetic");
            button.addEventListener("pointermove", function (event) {
                var rect = button.getBoundingClientRect();
                var x = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
                var y = ((event.clientY - rect.top) / rect.height - 0.5) * 5;
                button.style.setProperty("--sd2-magnet-x", x.toFixed(2) + "px");
                button.style.setProperty("--sd2-magnet-y", y.toFixed(2) + "px");
            }, { passive: true });
            button.addEventListener("pointerleave", function () {
                button.style.setProperty("--sd2-magnet-x", "0px");
                button.style.setProperty("--sd2-magnet-y", "0px");
            }, { passive: true });
        });
    }

    /* ---------------------------------------------------------
     * 8. Long-form story choreography
     *    Tracks the active pinned chapter and gives non-pinned page stages
     *    an in-view state. Uses CSS classes so reduced-motion remains simple.
     * --------------------------------------------------------- */
    function initStoryChoreography() {
        var stories = document.querySelectorAll("[data-sd2-story]");
        if (!stories.length) return;

        if ("IntersectionObserver" in window) {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    entry.target.classList.toggle("is-inview", entry.isIntersecting);
                });
            }, { rootMargin: "-12% 0px -12% 0px", threshold: 0.08 });
            stories.forEach(function (story) {
                if (story.getAttribute("data-sd2-story-bound") === "true") return;
                story.setAttribute("data-sd2-story-bound", "true");
                observer.observe(story);
            });
        } else {
            stories.forEach(function (story) { story.classList.add("is-inview"); });
        }

        var process = document.querySelector(".sd2-v3-process");
        if (!process || process.getAttribute("data-sd2-story-scroll-bound") === "true") return;
        process.setAttribute("data-sd2-story-scroll-bound", "true");
        var ticking = false;

        function update() {
            var steps = Array.prototype.slice.call(process.querySelectorAll("[data-sd2-story-step]"));
            if (!steps.length) { ticking = false; return; }
            var target = (window.innerHeight || document.documentElement.clientHeight) * 0.34;
            var active = 0;
            var best = Infinity;
            steps.forEach(function (step, index) {
                var distance = Math.abs(step.getBoundingClientRect().top - target);
                if (distance < best) { best = distance; active = index; }
            });
            steps.forEach(function (step, index) {
                step.classList.toggle("is-active", index === active);
                step.classList.toggle("is-past", index < active);
            });
            process.style.setProperty("--sd2-story-step", active);
            ticking = false;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate, { passive: true });
        update();
    }

    /* ---------------------------------------------------------
     * 9. V4 scroll experiences
     *    Drives the performance cockpit and horizontal platform reel with
     *    one requestAnimationFrame loop. Markup remains useful without JS.
     * --------------------------------------------------------- */
    function initV4ScrollExperiences() {
        var journey = document.querySelector("[data-v4-power-journey]");
        var horizontal = document.querySelector("[data-v4-horizontal]");
        if (!journey && !horizontal) return;
        if (document.documentElement.getAttribute("data-v4-scenes-bound") === "true") return;
        document.documentElement.setAttribute("data-v4-scenes-bound", "true");

        var chapters = journey ? Array.prototype.slice.call(journey.querySelectorAll("[data-v4-chapter]")) : [];
        var indexLabel = journey ? journey.querySelector("[data-v4-scene-index]") : null;
        var signal = journey ? journey.querySelector("[data-v4-signal]") : null;
        var signals = ["Airflow", "Cooling", "Control"];
        var ticking = false;

        function progressFor(el) {
            var rect = el.getBoundingClientRect();
            var range = Math.max(rect.height - window.innerHeight, 1);
            return Math.max(0, Math.min(1, -rect.top / range));
        }

        function update() {
            if (journey) {
                var progress = window.innerWidth <= 960 ? 0 : progressFor(journey);
                journey.style.setProperty("--v4-scene", progress.toFixed(4));
                var active = Math.max(0, Math.min(chapters.length - 1, Math.floor(progress * chapters.length)));
                if (progress >= 0.995) active = chapters.length - 1;
                chapters.forEach(function (chapter, index) { chapter.classList.toggle("is-active", index === active); });
                if (indexLabel) indexLabel.textContent = "0" + (active + 1) + " / 0" + chapters.length;
                if (signal) signal.textContent = signals[active] || signals[0];
            }
            if (horizontal) {
                var hProgress = window.innerWidth <= 960 ? 0 : progressFor(horizontal);
                horizontal.style.setProperty("--v4-horizontal", hProgress.toFixed(4));
            }
            ticking = false;
        }

        function requestUpdate() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate, { passive: true });
        update();
    }

    /* ---------------------------------------------------------
     * 10. Interactive build intent console
     * --------------------------------------------------------- */
    function initV4BuildConsole() {
        document.querySelectorAll("[data-v4-build-console]").forEach(function (consoleEl) {
            if (consoleEl.getAttribute("data-v4-console-bound") === "true") return;
            consoleEl.setAttribute("data-v4-console-bound", "true");
            var buttons = Array.prototype.slice.call(consoleEl.querySelectorAll("[data-v4-mode]"));
            var panels = Array.prototype.slice.call(consoleEl.querySelectorAll("[data-v4-mode-panel]"));
            var dial = consoleEl.querySelector(".sd2-v4-build-console__dial");
            var code = consoleEl.querySelector("[data-v4-mode-code]");

            function select(mode, focus) {
                var selected = 0;
                buttons.forEach(function (button, index) {
                    var on = button.getAttribute("data-v4-mode") === mode;
                    button.setAttribute("aria-selected", on ? "true" : "false");
                    button.setAttribute("tabindex", on ? "0" : "-1");
                    if (on) { selected = index; if (focus) button.focus(); }
                });
                panels.forEach(function (panel) {
                    var active = panel.getAttribute("data-v4-mode-panel") === mode;
                    panel.classList.toggle("is-active", active);
                    panel.setAttribute("aria-hidden", active ? "false" : "true");
                });
                if (dial) dial.style.setProperty("--v4-mode", selected);
                if (code) code.textContent = "0" + (selected + 1);
            }
            buttons.forEach(function (button, index) {
                button.addEventListener("click", function () { select(button.getAttribute("data-v4-mode"), false); });
                button.addEventListener("keydown", function (event) {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    var next = (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
                    select(buttons[next].getAttribute("data-v4-mode"), true);
                });
            });
            select("daily", false);
        });
    }

    /* ---------------------------------------------------------
     * 11. Truck Lab — accessible 3D platform carousel
     * --------------------------------------------------------- */
    function initV5TruckLab() {
        document.querySelectorAll("[data-v5-truck-lab]").forEach(function (lab) {
            if (lab.getAttribute("data-v5-truck-bound") === "true") return;
            lab.setAttribute("data-v5-truck-bound", "true");

            var stage = lab.querySelector("[data-v5-truck-stage]");
            var slides = Array.prototype.slice.call(lab.querySelectorAll("[data-v5-truck]"));
            var tabs = Array.prototype.slice.call(lab.querySelectorAll("[data-v5-truck-select]"));
            var previous = lab.querySelector("[data-v5-truck-prev]");
            var next = lab.querySelector("[data-v5-truck-next]");
            var index = 0;
            var dragStart = null;
            var dragPointerId = null;
            var suppressVisualClick = false;
            if (!stage || slides.length < 2) return;

            function clearDrag() {
                var pointerId = dragPointerId;
                dragStart = null;
                dragPointerId = null;
                lab.style.setProperty("--truck-px", "0");
                lab.style.setProperty("--truck-py", "0");
                if (pointerId === null || !stage.releasePointerCapture) return;
                try {
                    if (!stage.hasPointerCapture || stage.hasPointerCapture(pointerId)) {
                        stage.releasePointerCapture(pointerId);
                    }
                } catch (error) {
                    /* Capture can already be released when the pointer leaves the document. */
                }
            }

            function select(nextIndex, focusTab) {
                index = (nextIndex + slides.length) % slides.length;
                slides.forEach(function (slide, slideIndex) {
                    var relative = (slideIndex - index + slides.length) % slides.length;
                    slide.classList.toggle("is-active", relative === 0);
                    slide.classList.toggle("is-next", relative === 1);
                    slide.classList.toggle("is-prev", relative > 1);
                    slide.setAttribute("aria-hidden", relative === 0 ? "false" : "true");
                    slide.querySelectorAll("a,button").forEach(function (control) {
                        control.setAttribute("tabindex", relative === 0 ? "0" : "-1");
                    });
                });
                tabs.forEach(function (tab) {
                    var selected = tab.getAttribute("data-v5-truck-select") === slides[index].getAttribute("data-v5-truck");
                    tab.setAttribute("aria-selected", selected ? "true" : "false");
                    tab.setAttribute("tabindex", selected ? "0" : "-1");
                    if (selected && focusTab) tab.focus();
                });
            }

            tabs.forEach(function (tab) {
                tab.addEventListener("click", function () {
                    var requested = tab.getAttribute("data-v5-truck-select");
                    var requestedIndex = slides.findIndex(function (slide) { return slide.getAttribute("data-v5-truck") === requested; });
                    if (requestedIndex >= 0) select(requestedIndex, false);
                });
                tab.addEventListener("keydown", function (event) {
                    var requestedIndex = tabs.indexOf(tab);
                    if (event.key === "Home") requestedIndex = 0;
                    else if (event.key === "End") requestedIndex = tabs.length - 1;
                    else if (event.key === "ArrowRight" || event.key === "ArrowDown") requestedIndex += 1;
                    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") requestedIndex -= 1;
                    else return;
                    event.preventDefault();
                    select(requestedIndex, true);
                });
            });
            if (previous) previous.addEventListener("click", function () { select(index - 1, false); });
            if (next) next.addEventListener("click", function () { select(index + 1, false); });

            stage.addEventListener("keydown", function (event) {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                select(index + (event.key === "ArrowRight" ? 1 : -1), false);
            });
            stage.addEventListener("pointerdown", function (event) {
                if (event.target.closest && event.target.closest("button,.sd2-v5-truck__hud")) return;
                suppressVisualClick = false;
                dragStart = event.clientX;
                dragPointerId = event.pointerId;
            });
            stage.addEventListener("dragstart", function (event) {
                event.preventDefault();
            });
            stage.addEventListener("pointermove", function (event) {
                if (dragStart === null || event.pointerId !== dragPointerId || Math.abs(event.clientX - dragStart) <= 8) return;
                if (stage.setPointerCapture && (!stage.hasPointerCapture || !stage.hasPointerCapture(event.pointerId))) {
                    try { stage.setPointerCapture(event.pointerId); } catch (error) { /* Unsupported pointer source. */ }
                }
            });
            stage.addEventListener("pointerleave", function (event) {
                if (event.pointerId === dragPointerId && (!stage.hasPointerCapture || !stage.hasPointerCapture(event.pointerId))) {
                    suppressVisualClick = false;
                    clearDrag();
                }
            });
            stage.addEventListener("pointerup", function (event) {
                if (dragStart === null || event.pointerId !== dragPointerId) return;
                var distance = event.clientX - dragStart;
                clearDrag();
                if (Math.abs(distance) > 55) {
                    suppressVisualClick = true;
                    select(index + (distance < 0 ? 1 : -1), false);
                    window.setTimeout(function () { suppressVisualClick = false; }, 0);
                }
            });
            stage.addEventListener("pointercancel", function (event) {
                if (event.pointerId === dragPointerId) {
                    suppressVisualClick = false;
                    clearDrag();
                }
            });
            stage.addEventListener("lostpointercapture", function (event) {
                if (event.pointerId === dragPointerId) clearDrag();
            });
            stage.addEventListener("click", function (event) {
                if (!suppressVisualClick) return;
                suppressVisualClick = false;
                event.preventDefault();
                event.stopPropagation();
            }, true);

            if (!shouldReduce() && window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
                stage.addEventListener("pointermove", function (event) {
                    if (event.target.closest && event.target.closest("a,button,.sd2-v5-truck__hud")) {
                        lab.style.setProperty("--truck-px", "0");
                        lab.style.setProperty("--truck-py", "0");
                        return;
                    }
                    var rect = stage.getBoundingClientRect();
                    var x = ((event.clientX - rect.left) / rect.width - 0.5) * 4;
                    var y = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
                    lab.style.setProperty("--truck-px", x.toFixed(2));
                    lab.style.setProperty("--truck-py", y.toFixed(2));
                }, { passive: true });
                stage.addEventListener("pointerleave", function () {
                    lab.style.setProperty("--truck-px", "0");
                    lab.style.setProperty("--truck-py", "0");
                });
            }
            select(0, false);
        });
    }

    /* ---------------------------------------------------------
     * 12. Playful pointer label and branded internal route wipe
     * --------------------------------------------------------- */
    function initV4ExperienceUtilities() {
        if (!shouldReduce() && window.matchMedia && window.matchMedia("(pointer: fine)").matches && !document.querySelector(".sd2-v4-cursor")) {
            var cursor = document.createElement("div");
            cursor.className = "sd2-v4-cursor";
            cursor.setAttribute("aria-hidden", "true");
            cursor.textContent = "Explore";
            document.body.appendChild(cursor);
            var x = 0, y = 0, cursorTicking = false;
            function cursorBlocked(target) {
                return !!target.closest("input,select,textarea,option,form,[role='dialog'],.sd2-v2-garage,.sd2-v2-cart-drawer,.sd2-v2-search-console,.sd2-v2-toolbar,.sd2-v2-filter-sheet");
            }
            document.addEventListener("pointermove", function (event) {
                if (cursorBlocked(event.target)) {
                    cursor.classList.remove("is-visible", "is-action");
                    return;
                }
                x = event.clientX; y = event.clientY;
                if (cursorTicking) return;
                cursorTicking = true;
                requestAnimationFrame(function () {
                    cursor.style.setProperty("--v4-cursor-x", x + "px");
                    cursor.style.setProperty("--v4-cursor-y", y + "px");
                    cursor.classList.add("is-visible"); cursorTicking = false;
                });
            }, { passive: true });
            document.addEventListener("pointerover", function (event) {
                if (cursorBlocked(event.target)) {
                    cursor.classList.remove("is-visible", "is-action");
                    return;
                }
                var action = event.target.closest("a,button,.sd2-tilt");
                cursor.classList.toggle("is-action", !!action);
                cursor.textContent = action ? (action.matches("button") ? "Select" : "Open") : "Explore";
            }, { passive: true });
            document.addEventListener("pointerleave", function () { cursor.classList.remove("is-visible"); });
        }

        if (!document.querySelector(".sd2-v4-route-wipe")) {
            var wipe = document.createElement("div");
            wipe.className = "sd2-v4-route-wipe";
            wipe.setAttribute("aria-hidden", "true");
            wipe.textContent = "Loading your build";
            document.body.appendChild(wipe);
        }
        if (document.documentElement.getAttribute("data-v4-route-bound") === "true") return;
        document.documentElement.setAttribute("data-v4-route-bound", "true");
        document.addEventListener("click", function (event) {
            if (shouldReduce() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            var link = event.target.closest("a[href]");
            if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
            if (link.hasAttribute("data-v4-route-direct")) return;
            var href = link.getAttribute("href");
            if (!href || href.charAt(0) === "#" || href.indexOf("javascript:") === 0 || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return;
            var url;
            try { url = new URL(link.href, window.location.href); } catch (error) { return; }
            if (url.origin !== window.location.origin) return;
            event.preventDefault();
            var routeWipe = document.querySelector(".sd2-v4-route-wipe");
            if (routeWipe) routeWipe.classList.add("is-leaving");
            window.setTimeout(function () { window.location.href = url.href; }, 460);
        });
    }

    function initV6Commerce(root) {
        root = root || document;

        root.querySelectorAll(".sd2-v2-product-card:not([data-v6-play-bound])").forEach(function (card) {
            card.setAttribute("data-v6-play-bound", "true");
            card.addEventListener("pointermove", function (event) {
                if (shouldReduce()) return;
                var rect = card.getBoundingClientRect();
                card.style.setProperty("--v6-x", (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + "%");
                card.style.setProperty("--v6-y", (((event.clientY - rect.top) / rect.height) * 100).toFixed(1) + "%");
            });
        });

        root.querySelectorAll(".sd2-v2-method-card:not([data-v6-choice-bound])").forEach(function (card) {
            card.setAttribute("data-v6-choice-bound", "true");
            var input = card.querySelector('input[type="radio"]');
            if (!input) return;
            var sync = function () {
                var group = document.querySelectorAll('input[type="radio"][name="' + input.name + '"]');
                group.forEach(function (radio) {
                    var parent = radio.closest(".sd2-v2-method-card");
                    if (parent) parent.classList.toggle("is-selected", radio.checked);
                });
            };
            input.addEventListener("change", sync);
            sync();
        });
    }

    function initV7Surfaces(root) {
        root = root || document;
        var selector = [
            ".sd2-v2-trust-grid > div",
            ".sd2-v2-content-teaser",
            ".sd2-v2-help-card",
            ".sd2-v2-account-card",
            ".sd2-v2-auth-card",
            ".sd2-v2-auth__panel",
            ".sd2-v2-search-suggestions__block",
            ".sd2-v2-cart-polish",
            ".sd2-v2-coupon",
            ".sd2-v2-shipping-estimator",
            ".sd2-v2-editable-section"
        ].join(",");
        root.querySelectorAll(selector + ":not([data-v7-surface-bound])").forEach(function (surface) {
            surface.setAttribute("data-v7-surface-bound", "true");
            surface.addEventListener("pointermove", function (event) {
                if (shouldReduce()) return;
                var rect = surface.getBoundingClientRect();
                surface.style.setProperty("--v7-x", (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + "%");
                surface.style.setProperty("--v7-y", (((event.clientY - rect.top) / rect.height) * 100).toFixed(1) + "%");
            });
        });
    }

    function init() {
        enhancePage(document);
        initCinematicShell();
        initReveal();
        initTilt();
        initParallax();
        initDepthScenes();
        initScrollTelemetry();
        initPointerDetail();
        initStoryChoreography();
        initV4ScrollExperiences();
        initV4BuildConsole();
        initV5TruckLab();
        initV6Commerce(document);
        initV7Surfaces(document);
        initV4ExperienceUtilities();

        if ("MutationObserver" in window) {
            var mutationTicking = false;
            var observer = new MutationObserver(function (mutations) {
                var hasNewElements = mutations.some(function (mutation) {
                    return Array.prototype.some.call(mutation.addedNodes, function (node) {
                        return node.nodeType === 1;
                    });
                });
                if (!hasNewElements || mutationTicking) return;
                mutationTicking = true;
                requestAnimationFrame(function () {
                    enhancePage(document);
                    initCinematicShell();
                    initReveal();
                    initTilt();
                    initPointerDetail();
                    initStoryChoreography();
                    initV4BuildConsole();
                    initV5TruckLab();
                    initV6Commerce(document);
                    initV7Surfaces(document);
                    mutationTicking = false;
                });
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    if (reduceQuery) {
        var onPreferenceChange = function () {
            if (!shouldReduce()) return;
            document.querySelectorAll(".sd2-tilt, .sd2-parallax, .sd2-depth-layer").forEach(function (el) {
                el.classList.remove("is-tilting");
                el.style.transform = "";
                el.style.removeProperty("--sd2-depth-y");
                el.style.removeProperty("--sd2-depth-z");
                el.style.removeProperty("--sd2-depth-rx");
            });
            document.querySelectorAll(".sd2-reveal, .sd2-stagger").forEach(function (el) {
                el.classList.add("is-visible");
            });
        };
        if (reduceQuery.addEventListener) reduceQuery.addEventListener("change", onPreferenceChange);
        else if (reduceQuery.addListener) reduceQuery.addListener(onPreferenceChange);
    }

    window.SD2Motion = {
        refresh: function () {
            enhancePage(document);
            initReveal();
            initTilt();
            initDepthScenes();
            initV6Commerce(document);
            initV7Surfaces(document);
        }
    };
})();
