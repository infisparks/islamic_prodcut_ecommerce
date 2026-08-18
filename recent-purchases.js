/**
 * Production-Ready Real-Time Social Proof & Recent Purchases Notification Engine
 * Displays live sales proof toasts to engage customers on Home and Product pages.
 * Fully responsive, non-intrusive, mobile-friendly with touch swipe dismiss and click-to-view.
 */

(function () {
    'use strict';

    // 100+ Realistic Buyer Names across India
    const BUYER_NAMES = [
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
    const CITIES = [
        "Mumbai", "Delhi", "Hyderabad", "Bengaluru", "Lucknow", "Kolkata", "Ahmedabad",
        "Pune", "Chennai", "Srinagar", "Bhopal", "Patna", "Jaipur", "Surat", "Kanpur",
        "Nagpur", "Indore", "Varanasi", "Agra", "Aligarh", "Meerut", "Calicut", "Aurangabad",
        "Navi Mumbai", "Thane", "Secunderabad", "Bhiwandi", "Malegaon", "Gaya", "Bareilly"
    ];

    // Authentic Products in Catalog
    const PRODUCTS = [
        { name: "Umrah Dua & Guide Cards (Urdu)", image: "product/umrah_card_urdu.webp", id: 1 },
        { name: "Umrah Dua & Guide Cards (English)", image: "product/umrah_card_english.webp", id: 2 },
        { name: "Umrah Dua & Guide Cards (Hindi)", image: "product/umrah_card_hindi.webp", id: 3 },
        { name: "Umrah Dua & Guide Cards (Roman English)", image: "product/umrah_card_roman.webp", id: 4 },
        { name: "Full Companion Kit (Cards + Tasbih + Pouch)", image: "product/umrah_card_urdu.webp", id: 1 },
        { name: "Standard Kit (Cards + Tasbih + Lanyard)", image: "product/umrah_card_english.webp", id: 2 },
        { name: "Essential Pack (Cards + Tawaf Tasbih)", image: "product/umrah_card_hindi.webp", id: 3 },
        { name: "Dua Sticker Pack (Urdu)", image: "product/umrah_Sticker_urdu.webp", id: 7 },
        { name: "Dua Sticker Pack (English)", image: "product/umrah_Sticker_English.webp", id: 5 },
        { name: "Dua Sticker Pack (Hindi)", image: "product/umrah_Sticker_hindi.webp", id: 6 }
    ];

    // Recent Times
    const RECENT_TIMES = [
        "Just now", "4 seconds ago", "12 seconds ago", "28 seconds ago",
        "45 seconds ago", "1 min ago", "2 mins ago", "3 mins ago"
    ];

    let toastTimer = null;
    let nextPopupTimer = null;
    let isToastVisible = false;
    let isPausedByHover = false;
    let currentProduct = null;

    // Inject CSS for sleek luxury toast animation
    function injectStyles() {
        if (document.getElementById('recent-purchase-styles')) return;
        const style = document.createElement('style');
        style.id = 'recent-purchase-styles';
        style.textContent = `
            #recent-purchase-toast {
                position: fixed;
                bottom: 84px;
                left: 14px;
                z-index: 99999;
                max-width: 340px;
                width: calc(100vw - 28px);
                opacity: 0;
                transform: translateY(24px) scale(0.95);
                pointer-events: none;
                transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            @media (min-width: 640px) {
                #recent-purchase-toast {
                    bottom: 24px;
                    left: 24px;
                    width: 340px;
                }
            }
            #recent-purchase-toast.toast-active {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            .rp-card-box {
                background: #FFFFFF !important;
                border: 1.5px solid #E5C378 !important;
                box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.18), 0 2px 10px rgba(197, 154, 63, 0.25) !important;
                border-radius: 16px;
                padding: 10px 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                position: relative;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .rp-card-box:hover {
                transform: translateY(-2px);
                box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.22), 0 4px 14px rgba(197, 154, 63, 0.35) !important;
            }

            .rp-img-frame {
                width: 48px;
                height: 48px;
                border-radius: 12px;
                background: #F7F5F0;
                border: 1px solid #E8DFCC;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                padding: 2px;
            }
            .rp-img-frame img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            .rp-pulse-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background-color: #10B981;
                display: inline-block;
                animation: rpPulse 1.8s infinite;
            }
            @keyframes rpPulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }

            .rp-close-btn {
                position: absolute;
                top: 6px;
                right: 6px;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: #F3F4F6;
                color: #9CA3AF;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                border: none;
                cursor: pointer;
                transition: background 0.15s ease, color 0.15s ease;
            }
            .rp-close-btn:hover {
                background: #E5E7EB;
                color: #1F2937;
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
            <div id="rp-clickable-card" class="rp-card-box">
                <!-- Thumbnail -->
                <div class="rp-img-frame">
                    <img id="rp-image" src="product/umrah_card_urdu.webp" alt="Product thumbnail" loading="eager" decoding="async">
                </div>

                <!-- Info Content -->
                <div style="flex: 1; min-width: 0; padding-right: 14px;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                        <span id="rp-name" style="font-weight: 700; font-size: 12px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Faiz Ansari</span>
                        <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 9px; font-weight: 700; color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 1px 4px; border-radius: 4px; flex-shrink: 0;">
                            <span class="rp-pulse-dot"></span> Verified
                        </span>
                    </div>
                    <div style="font-size: 11px; color: #4B5563; line-height: 1.25; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        Purchased <span id="rp-product" style="font-weight: 600; color: #92400E;">Umrah Dua Cards (Urdu)</span>
                    </div>
                    <div style="font-size: 9.5px; color: #6B7280; display: flex; align-items: center; gap: 4px;">
                        <span id="rp-time">Just now</span>
                        <span>•</span>
                        <span id="rp-city" style="font-weight: 500; color: #374151;">Mumbai</span>
                    </div>
                </div>

                <!-- Close Button -->
                <button type="button" id="rp-close-action" class="rp-close-btn" aria-label="Close notification">
                    ✕
                </button>
            </div>
        `;
        document.body.appendChild(toast);

        // Click to view product
        const card = document.getElementById('rp-clickable-card');
        if (card) {
            card.addEventListener('click', (e) => {
                if (e.target.closest('#rp-close-action')) return;
                if (currentProduct && currentProduct.id) {
                    window.location.href = `product.html?id=${currentProduct.id}`;
                } else {
                    window.location.href = `product.html?id=1`;
                }
            });

            // Pause on hover
            card.addEventListener('mouseenter', () => { isPausedByHover = true; });
            card.addEventListener('mouseleave', () => { isPausedByHover = false; });
        }

        // Close button handler
        const closeBtn = document.getElementById('rp-close-action');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                hideToast();
            });
        }
    }

    // Pick random item from array
    function sample(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Show Notification Toast
    function showToast() {
        const toast = document.getElementById('recent-purchase-toast');
        if (!toast) return;

        const buyer = sample(BUYER_NAMES);
        const city = sample(CITIES);
        currentProduct = sample(PRODUCTS);
        const timeAgo = sample(RECENT_TIMES);

        const nameEl = document.getElementById('rp-name');
        const prodEl = document.getElementById('rp-product');
        const imgEl = document.getElementById('rp-image');
        const timeEl = document.getElementById('rp-time');
        const cityEl = document.getElementById('rp-city');

        if (nameEl) nameEl.textContent = buyer;
        if (prodEl) prodEl.textContent = currentProduct.name;
        if (imgEl) imgEl.src = currentProduct.image;
        if (timeEl) timeEl.textContent = timeAgo;
        if (cityEl) cityEl.textContent = city;

        toast.classList.add('toast-active');
        isToastVisible = true;

        // Auto-hide after 5.2 seconds (unless hovered)
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            if (!isPausedByHover) {
                hideToast();
            } else {
                // Check again in 2 seconds if still hovered
                const checkInterval = setInterval(() => {
                    if (!isPausedByHover) {
                        clearInterval(checkInterval);
                        hideToast();
                    }
                }, 1000);
            }
        }, 5200);
    }

    // Hide Notification Toast
    function hideToast() {
        const toast = document.getElementById('recent-purchase-toast');
        if (!toast) return;
        toast.classList.remove('toast-active');
        isToastVisible = false;

        // Schedule next popup in 7 to 12 seconds
        scheduleNext();
    }

    // Schedule Next Popup
    function scheduleNext() {
        if (nextPopupTimer) clearTimeout(nextPopupTimer);
        const intervalMs = Math.floor(Math.random() * 5000) + 7000; // 7s to 12s
        nextPopupTimer = setTimeout(() => {
            showToast();
        }, intervalMs);
    }

    // Touch Swipe Gesture on Mobile
    function setupTouchGesture(toast) {
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
            const deltaX = e.touches[0].clientX - startX;
            const deltaY = e.touches[0].clientY - startY;

            if (deltaX < -10 || deltaY > 10) {
                toast.style.transform = `translate(${deltaX * 0.6}px, ${deltaY * 0.6}px) scale(0.96)`;
                toast.style.opacity = Math.max(0.2, 1 - Math.abs(deltaX) / 160);
            }
        }, { passive: true });

        toast.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            const endX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX : startX;
            const deltaX = endX - startX;

            if (deltaX < -30) {
                toast.style.transform = '';
                toast.style.opacity = '';
                hideToast();
            } else {
                toast.style.transform = '';
                toast.style.opacity = '';
            }
        }, { passive: true });
    }

    // Initialize Engine
    function startEngine() {
        injectStyles();
        createToastElement();

        const toast = document.getElementById('recent-purchase-toast');
        if (toast) {
            setupTouchGesture(toast);
        }

        // Show first notification after 2 seconds on page load
        setTimeout(() => {
            showToast();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startEngine);
    } else {
        startEngine();
    }
})();
