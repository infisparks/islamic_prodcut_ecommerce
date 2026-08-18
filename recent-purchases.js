/**
 * Real-Time Social Proof & Recent Purchases Notification Engine
 * Displays small, professional, ultra-premium live sales popup toasts
 * Shown only on Home and Product pages at randomized 10-15s intervals for 2.5s
 * Automatically adapts text color and background contrast (Dark vs Light theme)
 * based on scroll position and background brightness.
 */

(function () {
    // 100+ Realistic Indian Names (diverse across Indian cities & communities)
    const INDIAN_BUYER_NAMES = [
        "Faiz Ansari", "Mohammed Zaid", "Ayesha Khan", "Fatima Sheikh", "Rahul Sharma",
        "Arshad Ali", "Imran Qureshi", "Sana Parveen", "Tariq Mehmood", "Farhan Siddiqui",
        "Yasmin Begum", "Rehan Malik", "Zainab Fatima", "Danish Khan", "Afreen Bano",
        "Bilal Ahmed", "Sumaiya Khan", "Zoya Akhtar", "Shadab Alam", "Irfan Patel",
        "Salman Qazi", "Rukhsar Bano", "Nadeem Akhtar", "Mehvish Khan", "Arif Mansoori",
        "Nazia Sultana", "Rizwan Sayed", "Parveen Bano", "Shoaib Malik", "Shabana Khatoon",
        "Adil Hussain", "Nida Fatima", "Javed Akhtar", "Shaista Parveen", "Wasim Akram",
        "Heena Kausar", "Asif Iqbal", "Saira Banu", "Mudassir Khan", "Ghazala Tabassum",
        "Tanveer Ahmed", "Tasneem Kausar", "Sohail Khan", "Bushra Anjum", "Nasiruddin Shah",
        "Rabia Basri", "Shakir Ali", "Mehreen Khan", "Sameer Sheikh", "Gulshan Ara",
        "Waseem Raza", "Lubna Afzal", "Feroz Khan", "Salma Begum", "Umair Siddiqui",
        "Shazia Mirza", "Hashim Ali", "Amreen Taj", "Zakir Hussain", "Reshma Patel",
        "Mazhar Khan", "Ishrat Jahan", "Khalid Saifullah", "Ruqayya Begum", "Junaid Khan",
        "Shahina Parveen", "Mohsin Raza", "Samina Bano", "Faisal Khan", "Shaheen Akhtar",
        "Zubair Ahmed", "Zeenat Aman", "Kamran Ali", "Shabnam Bano", "Naeem Akhtar",
        "Nahid Fatima", "Shahid Khan", "Tabassum Ara", "Atif Aslam", "Hina Khan",
        "Saif Ali", "Razia Sultana", "Owais Khan", "Shabana Azmi", "Rashid Khan",
        "Shireen Bano", "Danish Ali", "Tarannum Parveen", "Nasir Khan", "Nusrat Jahan",
        "Iqbal Ansari", "Sabina Khatoon", "Irfan Khan", "Shahla Nigar", "Mansoor Ali",
        "Shagufta Yasmin", "Akram Sheikh", "Rubeena Bano", "Sarfaraz Khan", "Nilofar Jahan",
        "Anas Siddiqui", "Alina Malik", "Hamza Qureshi", "Mariam Khan", "Kashif Raza",
        "Saba Anjum", "Tauseef Ahmed", "Farzana Begum", "Shahbaz Khan", "Nahid Akhtar"
    ];

    // Major Indian Cities
    const INDIAN_CITIES = [
        "Mumbai", "Delhi", "Hyderabad", "Bengaluru", "Lucknow", "Kolkata", "Ahmedabad",
        "Pune", "Chennai", "Srinagar", "Bhopal", "Patna", "Jaipur", "Surat", "Kanpur",
        "Nagpur", "Indore", "Varanasi", "Agra", "Aligarh", "Meerut", "Calicut", "Aurangabad"
    ];

    // Product Variants for Purchases
    const PRODUCTS = [
        { name: "Umrah Dua Cards (Urdu)", image: "product/umrah_card_urdu.webp", id: 1 },
        { name: "Umrah Dua Cards (Roman English)", image: "product/umrah_card_roman.webp", id: 4 },
        { name: "Umrah Dua Cards (English)", image: "product/umrah_card_english.webp", id: 2 },
        { name: "Umrah Dua Cards (Hindi)", image: "product/umrah_card_hindi.webp", id: 3 },
        { name: "Full Companion Kit (Urdu)", image: "product/umrah_card_urdu.webp", id: 1 },
        { name: "Full Companion Kit (Roman English)", image: "product/umrah_card_roman.webp", id: 4 },
        { name: "Essential Pack (Urdu)", image: "product/umrah_card_urdu.webp", id: 1 },
        { name: "Umrah Dua Sticker (Urdu)", image: "product/umrah_Sticker_urdu.webp", id: 7 },
        { name: "Umrah Dua Sticker (English)", image: "product/umrah_Sticker_English.webp", id: 5 },
        { name: "Umrah Dua Sticker (Hindi)", image: "product/umrah_Sticker_hindi.webp", id: 6 }
    ];

    // Natural Recent Time Phrases
    const RECENT_TIMES = [
        "2 seconds ago", "6 seconds ago", "14 seconds ago", "25 seconds ago",
        "42 seconds ago", "1 min ago", "2 mins ago", "just now", "3 mins ago"
    ];

    let toastTimer = null;
    let nextPopupTimer = null;
    let isToastVisible = false;

    // Inject CSS for smooth popup animations and dynamic dark/light themes
    function injectStyles() {
        if (document.getElementById('recent-purchase-styles')) return;
        const style = document.createElement('style');
        style.id = 'recent-purchase-styles';
        style.textContent = `
            #recent-purchase-toast {
                position: fixed;
                top: 70px;
                right: 16px;
                z-index: 9999;
                max-width: 320px;
                width: calc(100vw - 32px);
                opacity: 0;
                transform: translateY(-16px) scale(0.96);
                pointer-events: none;
                transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @media (min-width: 640px) {
                #recent-purchase-toast {
                    top: 80px;
                    right: 24px;
                    width: 310px;
                }
            }
            #recent-purchase-toast.toast-active {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            .toast-card-inner {
                transition: background 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
            }

            /* LIGHT THEME (When background content is white or light) */
            .toast-card-inner.theme-light {
                background: rgba(255, 255, 255, 0.98) !important;
                border: 1px solid rgba(223, 198, 133, 0.85) !important;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 0 15px rgba(197, 154, 63, 0.18) !important;
            }
            .toast-card-inner.theme-light .rp-img-box {
                background: #FAF8F5 !important;
                border: 1px solid #EBDCB2 !important;
            }
            .toast-card-inner.theme-light .rp-buyer-name {
                color: #111827 !important;
            }
            .toast-card-inner.theme-light .rp-verified-badge {
                background: #ECFDF5 !important;
                color: #047857 !important;
                border: 1px solid #A7F3D0 !important;
            }
            .toast-card-inner.theme-light .rp-action-desc {
                color: #4B5563 !important;
            }
            .toast-card-inner.theme-light .rp-product-title {
                color: #111827 !important;
            }
            .toast-card-inner.theme-light .rp-footer-meta {
                color: #6B7280 !important;
            }
            .toast-card-inner.theme-light .rp-close-btn {
                color: #9CA3AF !important;
            }
            .toast-card-inner.theme-light .rp-close-btn:hover {
                color: #111827 !important;
            }

            /* DARK THEME (When background content is dark/black hero) */
            .toast-card-inner.theme-dark {
                background: rgba(15, 18, 26, 0.96) !important;
                border: 1px solid rgba(223, 198, 133, 0.6) !important;
                box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.75), 0 0 20px rgba(197, 154, 63, 0.3) !important;
            }
            .toast-card-inner.theme-dark .rp-img-box {
                background: #1A1F2C !important;
                border: 1px solid rgba(223, 198, 133, 0.4) !important;
            }
            .toast-card-inner.theme-dark .rp-buyer-name {
                color: #FFFFFF !important;
            }
            .toast-card-inner.theme-dark .rp-verified-badge {
                background: rgba(6, 78, 59, 0.85) !important;
                color: #6EE7B7 !important;
                border: 1px solid rgba(52, 211, 153, 0.5) !important;
            }
            .toast-card-inner.theme-dark .rp-action-desc {
                color: #D1D5DB !important;
            }
            .toast-card-inner.theme-dark .rp-product-title {
                color: #F5EED9 !important;
            }
            .toast-card-inner.theme-dark .rp-footer-meta {
                color: #9CA3AF !important;
            }
            .toast-card-inner.theme-dark .rp-close-btn {
                color: #9CA3AF !important;
            }
            .toast-card-inner.theme-dark .rp-close-btn:hover {
                color: #FFFFFF !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Create Toast Container
    function createToastElement() {
        if (document.getElementById('recent-purchase-toast')) return;
        const toast = document.createElement('div');
        toast.id = 'recent-purchase-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <div id="rp-card-container" class="toast-card-inner theme-light backdrop-blur-md rounded-2xl p-2.5 sm:p-3 flex items-center gap-2.5 relative select-none">
                <!-- Thumbnail -->
                <div class="rp-img-box w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden p-0.5 transition-colors">
                    <img id="rp-image" src="product/umrah_card_urdu.webp" alt="Product" class="w-full h-full object-contain">
                </div>
                <!-- Content -->
                <div class="flex-1 min-w-0 pr-4">
                    <div class="flex items-center gap-1.5 leading-tight mb-0.5">
                        <span id="rp-name" class="rp-buyer-name font-bold text-xs truncate">Faiz Ansari</span>
                        <span class="rp-verified-badge inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1 py-0.2 rounded flex-shrink-0">
                            <i class="fa-solid fa-circle-check text-[7.5px]"></i> Verified
                        </span>
                    </div>
                    <div class="rp-action-desc text-[10.5px] leading-snug line-clamp-1">
                        purchased <span id="rp-product" class="rp-product-title font-semibold">Umrah Dua Cards</span>
                    </div>
                    <div class="rp-footer-meta flex items-center gap-1 text-[9px] font-medium mt-0.5">
                        <i class="fa-regular fa-clock text-[8.5px] text-gold-500"></i>
                        <span id="rp-time">2 seconds ago</span>
                        <span>•</span>
                        <span id="rp-city">Mumbai</span>
                    </div>
                </div>
                <!-- Close Button -->
                <button type="button" onclick="window.dismissRecentPurchaseToast && window.dismissRecentPurchaseToast(event)" class="rp-close-btn absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors cursor-pointer" aria-label="Dismiss notification">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `;
        document.body.appendChild(toast);
    }

    // Determine whether background under toast is dark
    function isDarkBackground() {
        const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        
        // On home page, top hero section (scrollY < 460) is dark background
        if (isHomePage) {
            if (window.scrollY < 460) {
                return true;
            }
            return false;
        }

        // On product page or other pages, check element directly behind the toast
        const toast = document.getElementById('recent-purchase-toast');
        if (!toast) return false;

        const rect = toast.getBoundingClientRect();
        const testX = rect.left + rect.width / 2;
        const testY = rect.top + rect.height / 2;

        toast.style.visibility = 'hidden';
        const el = document.elementFromPoint(testX, testY);
        toast.style.visibility = '';

        if (el) {
            const darkParent = el.closest('.bg-onyx, .bg-obsidian, .bg-black, [class*="from-neutral-900"], [class*="bg-neutral-900"], [class*="bg-stone-900"]');
            if (darkParent) return true;

            let current = el;
            while (current && current !== document.documentElement) {
                const style = window.getComputedStyle(current);
                const bg = style.backgroundColor;
                if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                    const rgb = bg.match(/\d+/g);
                    if (rgb && rgb.length >= 3) {
                        const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
                        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                        return luminance < 120;
                    }
                }
                current = current.parentElement;
            }
        }

        return false;
    }

    // Update Toast Theme dynamically
    function updateToastTheme() {
        const cardContainer = document.getElementById('rp-card-container');
        if (!cardContainer) return;

        const dark = isDarkBackground();
        if (dark) {
            cardContainer.classList.remove('theme-light');
            cardContainer.classList.add('theme-dark');
        } else {
            cardContainer.classList.remove('theme-dark');
            cardContainer.classList.add('theme-light');
        }
    }

    // Get Random Array Item
    function sample(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    // Show Notification Toast
    function showToast() {
        const toast = document.getElementById('recent-purchase-toast');
        if (!toast) return;

        const buyer = sample(INDIAN_BUYER_NAMES);
        const city = sample(INDIAN_CITIES);
        const product = sample(PRODUCTS);
        const timeAgo = sample(RECENT_TIMES);

        const nameEl = document.getElementById('rp-name');
        const prodEl = document.getElementById('rp-product');
        const imgEl = document.getElementById('rp-image');
        const timeEl = document.getElementById('rp-time');
        const cityEl = document.getElementById('rp-city');

        if (nameEl) nameEl.textContent = buyer;
        if (prodEl) prodEl.textContent = product.name;
        if (imgEl) imgEl.src = product.image;
        if (timeEl) timeEl.textContent = timeAgo;
        if (cityEl) cityEl.textContent = city;

        // Adapt theme to current scroll/background before animating in
        updateToastTheme();

        toast.classList.add('toast-active');
        isToastVisible = true;

        // Display for 3.5 seconds, then fade out
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            hideToast();
        }, 3500);
    }

    // Hide Notification Toast
    function hideToast() {
        const toast = document.getElementById('recent-purchase-toast');
        if (!toast) return;
        toast.style.transform = '';
        toast.style.opacity = '';
        toast.classList.remove('toast-active');
        isToastVisible = false;

        // Schedule next notification in random 10 to 15 seconds (10000ms - 15000ms)
        scheduleNext();
    }

    // Dismiss manually
    window.dismissRecentPurchaseToast = function (event) {
        if (event) event.stopPropagation();
        if (toastTimer) clearTimeout(toastTimer);
        hideToast();
    };

    // Schedule Next Show
    function scheduleNext() {
        if (nextPopupTimer) clearTimeout(nextPopupTimer);
        const intervalMs = Math.floor(Math.random() * 5000) + 10000; // 10000 to 15000 ms
        nextPopupTimer = setTimeout(() => {
            showToast();
        }, intervalMs);
    }

    // Touch Swipe-to-Dismiss Handler for Mobile Fingers
    function setupTouchGestureDismiss(toast) {
        if (!toast) return;
        let startX = 0, startY = 0, isDragging = false;

        toast.addEventListener('touchstart', (e) => {
            if (!e.touches || e.touches.length === 0) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        toast.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches || e.touches.length === 0) return;
            const curX = e.touches[0].clientX;
            const curY = e.touches[0].clientY;
            const deltaX = curX - startX;
            const deltaY = curY - startY;

            // Follow finger smoothly
            if (deltaY < 0 || Math.abs(deltaX) > 10) {
                toast.style.transform = `translate(${deltaX * 0.75}px, ${deltaY * 0.75}px) scale(0.97)`;
                toast.style.opacity = Math.max(0.2, 1 - (Math.abs(deltaX) + Math.abs(deltaY)) / 140);
            }
        }, { passive: true });

        toast.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const endX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX : startX;
            const endY = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientY : startY;
            const deltaX = endX - startX;
            const deltaY = endY - startY;

            // If swiped upward by > 15px or sideways by > 25px, dismiss cleanly
            if (deltaY < -15 || Math.abs(deltaX) > 25) {
                toast.style.transform = '';
                toast.style.opacity = '';
                hideToast();
            } else {
                toast.style.transform = '';
                toast.style.opacity = '';
            }
        }, { passive: true });
    }

    // Initialization
    function init() {
        injectStyles();
        createToastElement();

        const toast = document.getElementById('recent-purchase-toast');
        if (toast) {
            setupTouchGestureDismiss(toast);
        }

        // Listen for scroll events to adjust theme in real-time
        window.addEventListener('scroll', () => {
            if (isToastVisible) {
                updateToastTheme();
            }
        }, { passive: true });

        // Initial delay of 3 seconds before first popup triggers
        setTimeout(() => {
            showToast();
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
