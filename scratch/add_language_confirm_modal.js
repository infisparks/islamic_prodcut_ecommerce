const fs = require('fs');
const path = require('path');

const productPath = path.join(__dirname, '..', 'product.html');
let html = fs.readFileSync(productPath, 'utf8');

// 1. Add Modal HTML right after error-feedback-modal
const errorModalEndStr = '<!-- ERROR NOTIFICATION MODAL -->';
const reviewsSectionStr = '<!-- PILGRIM REVIEWS -->';

const errIdx = html.indexOf(errorModalEndStr);
const revIdx = html.indexOf(reviewsSectionStr, errIdx);

if (errIdx === -1 || revIdx === -1) {
    console.error('Could not find position for modal HTML');
    process.exit(1);
}

const modalHtml = `
    <!-- LANGUAGE & QUANTITY CONFIRMATION MODAL WITH DIGITAL PREVIEW -->
    <div id="language-confirm-modal" onclick="if(event.target === this) closeLanguageConfirmModal()" class="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm hidden flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div class="bg-white rounded-3xl max-w-lg w-full border border-gold-400/60 shadow-2xl overflow-hidden flex flex-col max-h-[95vh] relative animate-in fade-in zoom-in duration-200" onclick="event.stopPropagation()">
            
            <!-- Header -->
            <div class="p-4 bg-gradient-to-r from-onyx via-slate-900 to-onyx text-pearl border-b border-gold-500/40 relative flex items-center justify-between shrink-0">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-gold-500/20 text-gold-400 flex items-center justify-center text-base border border-gold-400/40 shrink-0">
                        <i class="fa-solid fa-language"></i>
                    </div>
                    <div>
                        <h3 class="font-cinzel text-sm sm:text-base font-bold text-gold-300">Confirm Your Card Language</h3>
                        <p class="text-[10px] text-gray-300">Pehle apni bhasha aur quantity confirm karein (Digital Preview)</p>
                    </div>
                </div>
                <button onclick="closeLanguageConfirmModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-pearl flex items-center justify-center text-xs cursor-pointer transition-colors" title="Close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>

            <!-- Scrollable Body -->
            <div class="p-4 sm:p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs">
                
                <!-- Digital Card Preview Section -->
                <div class="bg-gradient-to-b from-sand/60 to-white p-3.5 rounded-2xl border border-gold-200 text-center shadow-xs">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] uppercase tracking-wider font-extrabold text-gold-700 bg-gold-100/90 px-2 py-0.5 rounded-full border border-gold-300 flex items-center gap-1">
                            <i class="fa-solid fa-eye text-gold-600"></i> See Your Card Digitally
                        </span>
                        <span id="lang-modal-badge" class="font-black text-[11px] text-onyx bg-white px-2 py-0.5 rounded-md border border-gray-200 shadow-2xs">Urdu / اردو</span>
                    </div>

                    <!-- Preview Images Grid (Cover Box + Actual Prayer Card Inside) -->
                    <div class="grid grid-cols-2 gap-2.5 my-2.5">
                        <div class="relative rounded-xl overflow-hidden bg-white border border-gray-200 shadow-2xs group aspect-[4/5] flex items-center justify-center">
                            <img id="lang-preview-img-cover" src="product/umrah_card_urdu.webp" alt="Card Box Cover" class="w-full h-full object-contain p-1.5 transition-transform group-hover:scale-105 duration-300">
                            <span class="absolute bottom-1.5 left-1.5 bg-black/75 text-white text-[8.5px] px-1.5 py-0.5 rounded font-bold backdrop-blur-xs">Cover & Box</span>
                        </div>
                        <div class="relative rounded-xl overflow-hidden bg-white border border-gray-200 shadow-2xs group aspect-[4/5] flex items-center justify-center">
                            <img id="lang-preview-img-inside" src="product/prodcut_more/umrahcard_urdu_1.webp" alt="Sample Inside Card" class="w-full h-full object-contain p-1.5 transition-transform group-hover:scale-105 duration-300">
                            <span class="absolute bottom-1.5 left-1.5 bg-black/75 text-white text-[8.5px] px-1.5 py-0.5 rounded font-bold backdrop-blur-xs">Inside Card Sample</span>
                        </div>
                    </div>

                    <div id="lang-preview-desc" class="text-[11px] font-semibold text-gray-800 bg-white p-2.5 rounded-xl border border-gold-200/80 mt-1 shadow-2xs leading-relaxed">
                        عربی دعا + سلیس اردو ترجمہ اور مکمل مناسک عمرہ کی رہنمائی
                    </div>

                    <div class="flex items-center justify-center gap-3 text-[10px] text-gray-500 font-medium mt-2 pt-1 border-t border-gray-100 flex-wrap">
                        <span class="flex items-center gap-1 text-emerald-700 font-semibold"><i class="fa-solid fa-check text-emerald-600"></i> 100% Waterproof</span>
                        <span class="flex items-center gap-1 text-emerald-700 font-semibold"><i class="fa-solid fa-check text-emerald-600"></i> Pocket Size with Lanyard</span>
                        <span class="flex items-center gap-1 text-emerald-700 font-semibold"><i class="fa-solid fa-check text-emerald-600"></i> Tawaf Tasbih Included</span>
                    </div>
                </div>

                <!-- Language Choice Selection (4 Tiles) -->
                <div>
                    <label class="block text-xs font-bold text-onyx mb-1.5 flex items-center justify-between">
                        <span>1. Select Language Edition: <span class="text-rose-500">*</span></span>
                        <span class="text-[10px] text-gold-600 font-semibold">Tap to switch preview</span>
                    </label>
                    <div class="grid grid-cols-2 gap-2" id="lang-modal-tiles">
                        <!-- Urdu Tile -->
                        <button type="button" onclick="setModalLanguage('Urdu')" id="modal-lang-tile-Urdu" class="lang-modal-tile p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-base">🇵🇰</span>
                                <div>
                                    <div class="font-extrabold text-xs text-onyx">Urdu (اردو)</div>
                                    <div class="text-[10px] text-gray-500 font-medium">Urdu translation</div>
                                </div>
                            </div>
                            <i class="fa-solid fa-circle-check text-sm text-gray-300 tile-check"></i>
                        </button>

                        <!-- Hindi Tile -->
                        <button type="button" onclick="setModalLanguage('Hindi')" id="modal-lang-tile-Hindi" class="lang-modal-tile p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-base">🇮🇳</span>
                                <div>
                                    <div class="font-extrabold text-xs text-onyx">Hindi (हिंदी)</div>
                                    <div class="text-[10px] text-gray-500 font-medium">Hindi translation</div>
                                </div>
                            </div>
                            <i class="fa-solid fa-circle-check text-sm text-gray-300 tile-check"></i>
                        </button>

                        <!-- English Tile -->
                        <button type="button" onclick="setModalLanguage('English')" id="modal-lang-tile-English" class="lang-modal-tile p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-base">🇬🇧</span>
                                <div>
                                    <div class="font-extrabold text-xs text-onyx">English</div>
                                    <div class="text-[10px] text-gray-500 font-medium">English translation</div>
                                </div>
                            </div>
                            <i class="fa-solid fa-circle-check text-sm text-gray-300 tile-check"></i>
                        </button>

                        <!-- Roman English Tile -->
                        <button type="button" onclick="setModalLanguage('Roman')" id="modal-lang-tile-Roman" class="lang-modal-tile p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-base">🔤</span>
                                <div>
                                    <div class="font-extrabold text-xs text-onyx">Roman English</div>
                                    <div class="text-[10px] text-gray-500 font-medium">Hinglish / Roman</div>
                                </div>
                            </div>
                            <i class="fa-solid fa-circle-check text-sm text-gray-300 tile-check"></i>
                        </button>
                    </div>
                </div>

                <!-- Quantity Stepper -->
                <div class="p-3 bg-sand/40 rounded-2xl border border-gray-200 flex items-center justify-between gap-3">
                    <div>
                        <label class="block text-xs font-bold text-onyx">2. Select Quantity / Kit Count:</label>
                        <p class="text-[10px] text-gray-500">Kitne kits mangwane hain?</p>
                    </div>
                    <div class="flex items-center gap-2 bg-white px-2 py-1 rounded-xl border border-gray-300 shadow-2xs">
                        <button type="button" onclick="changeModalQty(-1)" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-onyx font-black text-sm flex items-center justify-center cursor-pointer active:scale-95 transition-all">-</button>
                        <span id="modal-qty-display" class="w-7 text-center font-black text-sm text-onyx font-mono">1</span>
                        <button type="button" onclick="changeModalQty(1)" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-onyx font-black text-sm flex items-center justify-center cursor-pointer active:scale-95 transition-all">+</button>
                    </div>
                </div>

                <!-- Total Price & Free Delivery Badge -->
                <div class="bg-emerald-50/80 p-3 rounded-xl border border-emerald-300 flex items-center justify-between text-xs">
                    <div>
                        <div class="font-bold text-emerald-950 flex items-center gap-1.5">
                            <i class="fa-solid fa-truck-fast text-emerald-600"></i>
                            <span>100% Free Shipping on Prepaid</span>
                        </div>
                        <div class="text-[10.5px] text-emerald-800 font-medium mt-0.5" id="modal-package-subtitle">Full Companion Kit (1 Kit)</div>
                    </div>
                    <div class="text-right">
                        <div class="text-base font-black text-emerald-800 font-mono" id="modal-total-price">Rs. 599.00</div>
                        <div class="text-[10px] text-gray-400 line-through" id="modal-mrp-price">MRP Rs. 1198.00</div>
                    </div>
                </div>

            </div>

            <!-- Action Buttons -->
            <div class="p-3.5 sm:p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2.5 shrink-0">
                <button type="button" onclick="closeLanguageConfirmModal()" class="px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-100 text-onyx font-bold text-xs transition-colors cursor-pointer">
                    Cancel
                </button>
                <button type="button" onclick="confirmLanguageAndProceed()" id="modal-confirm-btn" class="flex-1 gold-bg-gradient hover:opacity-95 text-onyx font-black py-2.5 px-4 rounded-xl shadow-gold-glow flex items-center justify-center gap-2 text-xs transition-all cursor-pointer active:scale-98">
                    <i class="fa-solid fa-circle-check text-sm"></i>
                    <span id="modal-confirm-btn-text">Confirm Urdu & Proceed to Checkout</span>
                </button>
            </div>
        </div>
    </div>
`;

html = html.substring(0, revIdx) + modalHtml + '\n    ' + html.substring(revIdx);
console.log('Inserted Modal HTML into product.html');

// 2. Add JavaScript logic for Language Confirmation Modal
const jsModalCode = `
        // ==========================================
        // LANGUAGE & QUANTITY CONFIRMATION MODAL LOGIC
        // ==========================================
        let modalTargetAction = 'buy'; // 'buy' or 'cart'
        let modalSelectedLang = 'English';
        let modalSelectedQty = 1;
        let isDirectAddingFromModal = false;

        const LANG_PREVIEW_DATA = {
            'Urdu': {
                name: 'Urdu (اردو)',
                badge: '🇵🇰 Urdu Edition (اردو)',
                cover: 'product/umrah_card_urdu.webp',
                inside: 'product/prodcut_more/umrahcard_urdu_1.webp',
                desc: 'عربی دعا + سلیس اردو ترجمہ اور مکمل مناسک عمرہ کی رہنمائی (Urdu Translation)'
            },
            'Hindi': {
                name: 'Hindi (हिंदी)',
                badge: '🇮🇳 Hindi Edition (हिंदी)',
                cover: 'product/umrah_card_hindi.webp',
                inside: 'product/prodcut_more/umrahcard_hindi_1.webp',
                desc: 'अरबी दुआ + आसान हिंदी तर्जुमा और उमराह के सभी अरकान की पूरी जानकारी (Hindi Translation)'
            },
            'English': {
                name: 'English',
                badge: '🇬🇧 English Edition',
                cover: 'product/umrah_card_english.webp',
                inside: 'product/prodcut_more/umrahcard_english_1.webp',
                desc: 'Authentic Arabic Dua + Clear English Translation & Step-by-Step Guide'
            },
            'Roman': {
                name: 'Roman English',
                badge: '🔤 Roman English (Hinglish)',
                cover: 'product/umrah_card_roman.webp',
                inside: 'product/prodcut_more/umrahcard_roman_1.webp',
                desc: 'Arabic Dua + Roman Urdu / English Transliteration (Easy to read for everyone)'
            }
        };

        function openLanguageConfirmModal(action = 'buy') {
            modalTargetAction = action;
            modalSelectedQty = 1;
            modalSelectedLang = currentProduct.language || 'English';
            if (modalSelectedLang === 'Roman English') modalSelectedLang = 'Roman';

            updateLanguageModalUI();
            const modalEl = document.getElementById('language-confirm-modal');
            if (modalEl) modalEl.classList.remove('hidden');
        }

        function closeLanguageConfirmModal() {
            const modalEl = document.getElementById('language-confirm-modal');
            if (modalEl) modalEl.classList.add('hidden');
        }

        function setModalLanguage(lang) {
            modalSelectedLang = lang;
            updateLanguageModalUI();
        }

        function changeModalQty(delta) {
            modalSelectedQty = Math.max(1, Math.min(10, modalSelectedQty + delta));
            updateLanguageModalUI();
        }

        function updateLanguageModalUI() {
            const data = LANG_PREVIEW_DATA[modalSelectedLang] || LANG_PREVIEW_DATA['English'];
            
            const coverImg = document.getElementById('lang-preview-img-cover');
            const insideImg = document.getElementById('lang-preview-img-inside');
            const badgeEl = document.getElementById('lang-modal-badge');
            const descEl = document.getElementById('lang-preview-desc');
            
            if (coverImg) coverImg.src = data.cover;
            if (insideImg) insideImg.src = data.inside;
            if (badgeEl) badgeEl.textContent = data.badge;
            if (descEl) descEl.textContent = data.desc;

            // Update tiles active classes
            ['Urdu', 'Hindi', 'English', 'Roman'].forEach(l => {
                const tile = document.getElementById(\`modal-lang-tile-\${l}\`);
                if (!tile) return;
                const check = tile.querySelector('.tile-check');
                if (l === modalSelectedLang) {
                    tile.className = 'lang-modal-tile p-2.5 rounded-xl border-2 border-gold-500 bg-gold-50/70 text-left transition-all cursor-pointer flex items-center justify-between shadow-xs';
                    if (check) check.className = 'fa-solid fa-circle-check text-sm text-emerald-600 tile-check';
                } else {
                    tile.className = 'lang-modal-tile p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-left transition-all cursor-pointer flex items-center justify-between';
                    if (check) check.className = 'fa-solid fa-circle-check text-sm text-gray-200 tile-check';
                }
            });

            // Update Qty display & price
            const qtyDisplay = document.getElementById('modal-qty-display');
            if (qtyDisplay) qtyDisplay.textContent = modalSelectedQty;

            const hasVariants = currentProduct.variants && currentProduct.variants.length > 0;
            const variant = hasVariants ? currentProduct.variants[currentVariantIndex] : null;
            const unitPrice = variant ? variant.price : (currentProduct.price || 599);
            const unitMrp = variant ? (variant.oldPrice || unitPrice * 2) : 1198;
            const totalPrice = unitPrice * modalSelectedQty;
            const totalMrp = unitMrp * modalSelectedQty;

            const totalEl = document.getElementById('modal-total-price');
            const mrpEl = document.getElementById('modal-mrp-price');
            const subTitleEl = document.getElementById('modal-package-subtitle');
            const btnTextEl = document.getElementById('modal-confirm-btn-text');

            if (totalEl) totalEl.textContent = \`Rs. \${totalPrice.toFixed(2)}\`;
            if (mrpEl) mrpEl.textContent = \`MRP Rs. \${totalMrp.toFixed(2)}\`;
            if (subTitleEl) subTitleEl.textContent = \`\${variant ? variant.shortName : currentProduct.name} (\${modalSelectedQty} \${modalSelectedQty === 1 ? 'Kit' : 'Kits'})\`;

            if (btnTextEl) {
                if (modalTargetAction === 'buy') {
                    btnTextEl.textContent = \`Confirm \${data.name} & Proceed (Rs. \${totalPrice.toFixed(0)})\`;
                } else {
                    btnTextEl.textContent = \`Confirm \${data.name} & Add (\${modalSelectedQty}x) to Cart\`;
                }
            }
        }

        function confirmLanguageAndProceed() {
            // 1. Switch product language
            switchProductLanguage(modalSelectedLang);

            // 2. Add with confirmed quantity
            const p = currentProduct;
            const hasVariants = p.variants && p.variants.length > 0;
            const variant = hasVariants ? p.variants[currentVariantIndex] : null;
            const curJanamazObj = janamazColors.find(c => c.id === currentJanamazColor) || janamazColors[0];
            const isCombo = variant && variant.hasJanamaz;
            const isJanamazProd = (p.category === 'janamaz' || p.id === 8);
            const cartKey = variant 
                ? ((isCombo || isJanamazProd) ? \`\${p.id}_\${variant.sku}_\${currentJanamazColor}\` : \`\${p.id}_\${variant.sku}\`) 
                : \`\${p.id}_default\`;

            const vName = isJanamazProd 
                ? (variant ? variant.shortName : curJanamazObj.name)
                : (variant ? (isCombo ? \`\${variant.shortName} (\${curJanamazObj.name})\` : variant.shortName) : '');

            const itemImage = isJanamazProd
                ? curJanamazObj.image
                : ((variant && variant.image) ? variant.image : p.image);

            const itemDisplayName = isJanamazProd ? \`Pocket Travel Janamaz (\${curJanamazObj.name})\` : p.name;

            if (modalTargetAction === 'buy') {
                // Direct Buy: Set cart strictly to confirmed product & quantity
                cart = [{
                    cartKey,
                    id: p.id,
                    name: itemDisplayName,
                    sku: variant ? variant.sku : p.sku,
                    variantName: vName,
                    price: variant ? variant.price : p.price,
                    image: itemImage,
                    weightKg: variant ? (variant.weightKg || (isCombo ? 0.26 : 0.15)) : (p.weightKg || 0.15),
                    qty: modalSelectedQty,
                    janamazColor: (isCombo || isJanamazProd) ? curJanamazObj.name : undefined
                }];
                saveCartToStorage();
                closeLanguageConfirmModal();
                window.location.href = 'checkout.html';
            } else {
                // Add to Cart
                const existing = cart.find(i => i.cartKey === cartKey);
                if (existing) {
                    existing.qty += modalSelectedQty;
                } else {
                    cart.push({
                        cartKey,
                        id: p.id,
                        name: itemDisplayName,
                        sku: variant ? variant.sku : p.sku,
                        variantName: vName,
                        price: variant ? variant.price : p.price,
                        image: itemImage,
                        weightKg: variant ? (variant.weightKg || (isCombo ? 0.26 : 0.15)) : (p.weightKg || 0.15),
                        qty: modalSelectedQty,
                        janamazColor: (isCombo || isJanamazProd) ? curJanamazObj.name : undefined
                    });
                }
                saveCartToStorage();
                updateCartUI(true);
                closeLanguageConfirmModal();
                showToast(\`\${p.name} (\${modalSelectedQty}x) added to Cart!\`);
            }
        }
`;

// 3. Update addPdpProductToCart and buyPdpProductNow to trigger the modal for card/sticker products
const oldAddCartStart = 'function addPdpProductToCart() {';
const newAddCartStart = `function addPdpProductToCart() {
            const p = currentProduct;

            // If product has language options, validate & confirm language + quantity first!
            if ((p.category === 'card' || p.category === 'sticker') && !isDirectAddingFromModal) {
                openLanguageConfirmModal('cart');
                return;
            }`;

const oldBuyNowStart = 'function buyPdpProductNow() {';
const newBuyNowStart = `function buyPdpProductNow() {
            const p = currentProduct;

            // If product has language options, validate & confirm language + quantity first!
            if (p.category === 'card' || p.category === 'sticker') {
                openLanguageConfirmModal('buy');
                return;
            }`;

html = html.replace(oldAddCartStart, newAddCartStart);
html = html.replace(oldBuyNowStart, newBuyNowStart);

// Append jsModalCode before showToast
const showToastStr = 'function showToast(msg) {';
const toastIdx = html.indexOf(showToastStr);
if (toastIdx === -1) {
    console.error('Could not find showToast position');
    process.exit(1);
}

html = html.substring(0, toastIdx) + jsModalCode + '\n        ' + html.substring(toastIdx);
console.log('Inserted Modal JS logic into product.html');

fs.writeFileSync(productPath, html, 'utf8');
console.log('Successfully updated product.html! Size:', html.length);

