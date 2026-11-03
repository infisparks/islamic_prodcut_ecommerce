const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(adminPath, 'utf8');

console.log('Original admin.html size:', html.length);

// 1. Refine Tailwind & CSS styles in <head>
const oldStyleMatch = /<style>[\s\S]*?<\/style>/;
const newStyles = `<style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #F8FAFC;
            color: #0F172A;
            letter-spacing: -0.011em;
            -webkit-tap-highlight-color: transparent;
        }
        .admin-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.03), 0 1px 2px -1px rgba(15, 23, 42, 0.02);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .admin-card:hover {
            box-shadow: 0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #F1F5F9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #CBD5E1;
            border-radius: 9999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #94A3B8;
        }
        .stat-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 16px;
            box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04);
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px -4px rgba(15, 23, 42, 0.08);
            border-color: #CBD5E1;
        }
        .action-btn {
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .action-btn:active {
            transform: scale(0.97);
        }
        @media print {
            .no-print { display: none !important; }
        }
    </style>`;

html = html.replace(oldStyleMatch, newStyles);

// 2. Refine Top Navigation Bar
const navStartStr = '<!-- TOP NAVIGATION HEADER BAR (Clean Full-Width Header - No Sidebar) -->';
const navEndStr = '</header>';
const navStartIdx = html.indexOf(navStartStr);
const navEndIdx = html.indexOf(navEndStr, navStartIdx);

if (navStartIdx !== -1 && navEndIdx !== -1) {
    const newHeader = `<!-- TOP NAVIGATION HEADER BAR (Clean Full-Width Header - No Sidebar) -->
        <header class="bg-white/95 backdrop-blur-md border-b border-slate-200/90 sticky top-0 z-30 shadow-[0_1px_3px_0_rgba(15,23,42,0.03)]">
            <div class="max-w-[1680px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <!-- Brand / Logo -->
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 text-white font-black flex items-center justify-center text-sm shadow-sm ring-2 ring-indigo-500/20">
                        FC
                    </div>
                    <div>
                        <div class="text-sm sm:text-base font-extrabold text-slate-900 leading-none flex items-center gap-2">
                            <span>FATIMA CALLIGRAPHER</span>
                            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span>Live Store</span>
                            </span>
                        </div>
                        <div class="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                            <i class="fa-solid fa-store text-indigo-500 text-[10px]"></i>
                            <span>Admin Management & Fulfillment Portal</span>
                        </div>
                    </div>
                </div>

                <!-- Center Quick Navigation & Helpline -->
                <div class="flex items-center gap-2 text-xs flex-wrap">
                    <a href="/" target="_blank" class="px-3.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 font-bold transition-all flex items-center gap-1.5 border border-slate-200/90 shadow-2xs">
                        <i class="fa-solid fa-arrow-up-right-from-square text-indigo-600 text-xs"></i>
                        <span>Storefront</span>
                    </a>
                    <a href="tel:+919970347703" class="px-3.5 py-1.5 rounded-xl bg-indigo-50/80 text-indigo-900 font-bold hover:bg-indigo-100 transition-colors flex items-center gap-1.5 border border-indigo-200/80 shadow-2xs">
                        <i class="fa-solid fa-phone text-indigo-600 text-xs"></i>
                        <span>+91 99703 47703</span>
                    </a>
                    <a href="https://wa.me/919970347703" target="_blank" class="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 font-bold hover:bg-emerald-100 transition-colors flex items-center gap-1.5 border border-emerald-200 shadow-2xs">
                        <i class="fa-brands fa-whatsapp text-emerald-600 text-xs"></i>
                        <span>WhatsApp Helpline</span>
                    </a>
                </div>

                <!-- Right User Info & Logout -->
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2.5 bg-slate-50/90 border border-slate-200/80 px-3 py-1.5 rounded-xl shadow-2xs">
                        <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs" id="user-avatar-initial">
                            A
                        </div>
                        <div class="hidden md:block text-left">
                            <div class="text-xs font-bold text-slate-900 max-w-[150px] truncate" id="admin-user-email">admin@example.com</div>
                            <div class="text-[9.5px] text-slate-500 font-medium">Store Admin</div>
                        </div>
                    </div>
                    <button onclick="handleAdminLogout()" title="Logout" class="px-3 py-1.5 text-xs text-rose-700 hover:text-white hover:bg-rose-600 border border-rose-200/90 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95">
                        <i class="fa-solid fa-right-from-bracket text-xs"></i>
                        <span>Logout</span>
                    </button>
                </div>
            </div>`;
    html = html.substring(0, navStartIdx) + newHeader + html.substring(navEndIdx);
    console.log('Updated Top Navigation Bar');
}

// 3. Refine Sub-header / Actions Toolbar
const subHeaderMatch = /<!-- SUB-HEADER \/ ACTIONS TOOLBAR -->[\s\S]*?<!-- DASHBOARD BODY -->/;
const newSubHeader = `<!-- SUB-HEADER / ACTIONS TOOLBAR -->
            <div class="bg-white border-b border-slate-200/90 px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
                <div>
                    <h2 class="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <span>Orders & Realtime Analytics</span>
                        <span class="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/80">
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>Live Sync</span>
                        </span>
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5 font-medium">Realtime revenue metrics, multi-item custom kit breakdown, and 1-click dispatch operations</p>
                </div>

                <!-- Export & Refresh Actions Toolbar -->
                <div class="flex items-center gap-2 flex-wrap">
                    <!-- Excel Export Button -->
                    <button onclick="exportToExcel()" class="action-btn px-3.5 py-2 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200/90 hover:border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer" title="Export current filtered data to Excel (.xlsx)">
                        <i class="fa-solid fa-file-excel text-emerald-600 text-xs"></i>
                        <span>Export Excel</span>
                    </button>

                    <!-- CSV Export Button -->
                    <button onclick="exportToCSV()" class="action-btn px-3.5 py-2 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-200/90 hover:border-blue-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer" title="Export current filtered data to CSV (.csv)">
                        <i class="fa-solid fa-file-csv text-blue-600 text-xs"></i>
                        <span>Export CSV</span>
                    </button>

                    <!-- PDF Report Export Button -->
                    <button onclick="exportToPDF()" class="action-btn px-3.5 py-2 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-800 border border-slate-200/90 hover:border-rose-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer" title="Download printable PDF Executive Report">
                        <i class="fa-solid fa-file-pdf text-rose-600 text-xs"></i>
                        <span>Export PDF</span>
                    </button>

                    <!-- Refresh Button -->
                    <button onclick="loadOrdersAndStats()" class="action-btn px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer" title="Refresh data">
                        <i class="fa-solid fa-arrows-rotate text-xs text-slate-300" id="refresh-icon"></i>
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            <!-- DASHBOARD BODY -->`;

html = html.replace(subHeaderMatch, newSubHeader);
console.log('Updated Sub-header / Actions Toolbar');

// 4. Refine KPI Metric Cards
const kpiMatch = /<!-- METRIC CARDS & FINANCIAL TOTALS \(6-Card Grid\) -->[\s\S]*?<!-- ORDERS TABLE CARD -->/;
const newKpis = `<!-- METRIC CARDS & FINANCIAL TOTALS (6-Card Grid) -->
                <div class="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
                    
                    <!-- 1. Total Orders & Units -->
                    <div class="stat-card p-4 rounded-2xl bg-white border border-slate-200/90">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                            <span class="uppercase tracking-wider text-[10px]">Total Booked</span>
                            <span class="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs shadow-2xs"><i class="fa-solid fa-boxes-stacked"></i></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight" id="stat-total-orders">0</div>
                        <div class="text-[11px] text-slate-500 font-semibold mt-1 flex items-center gap-1" id="stat-items-sold">
                            <i class="fa-solid fa-cubes text-[10px] text-slate-400"></i>
                            <span>0 units sold</span>
                        </div>
                    </div>

                    <!-- 2. Gross Booked Revenue -->
                    <div class="stat-card p-4 rounded-2xl bg-white border border-slate-200/90">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                            <span class="uppercase tracking-wider text-[10px]">Gross Revenue</span>
                            <span class="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs shadow-2xs"><i class="fa-solid fa-indian-rupee-sign"></i></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-indigo-700 tracking-tight" id="stat-total-revenue">Rs. 0</div>
                        <div class="text-[11px] text-slate-500 font-semibold mt-1" id="stat-aov">AOV: Rs. 0 / order</div>
                    </div>

                    <!-- 3. REALIZED DELIVERED REVENUE (Highlighted Card) -->
                    <div class="stat-card p-4 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/50 border-2 border-emerald-500/90 relative overflow-hidden shadow-xs">
                        <div class="flex items-center justify-between text-xs font-bold text-emerald-950 mb-1.5">
                            <span class="flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                                <i class="fa-solid fa-circle-check text-emerald-600"></i> Delivered Total
                            </span>
                            <span class="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">Realized</span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight" id="stat-delivered-revenue">Rs. 0</div>
                        <div class="text-[11px] text-emerald-900 font-bold mt-1 flex items-center gap-1" id="stat-delivered-count-text">
                            <i class="fa-solid fa-truck-ramp-box text-[10px] text-emerald-600"></i>
                            <span>0 Orders Delivered</span>
                        </div>
                    </div>

                    <!-- 4. Online Paid -->
                    <div class="stat-card p-4 rounded-2xl bg-white border border-slate-200/90">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                            <span class="uppercase tracking-wider text-[10px]">Paid Online</span>
                            <span class="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs shadow-2xs"><i class="fa-solid fa-bolt"></i></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight" id="stat-paid-revenue">Rs. 0</div>
                        <div class="text-[11px] text-emerald-800 font-bold mt-1" id="stat-paid-orders">0 Orders</div>
                    </div>

                    <!-- 5. COD Expected Revenue -->
                    <div class="stat-card p-4 rounded-2xl bg-white border border-slate-200/90">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                            <span class="uppercase tracking-wider text-[10px]">COD Expected</span>
                            <span class="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xs shadow-2xs"><i class="fa-solid fa-hand-holding-dollar"></i></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight" id="stat-cod-revenue">Rs. 0</div>
                        <div class="text-[11px] text-amber-900 font-bold mt-1" id="stat-cod-orders">0 Orders</div>
                    </div>

                    <!-- 6. Delivery & Cancellations Status Breakdown -->
                    <div class="stat-card p-4 rounded-2xl bg-white border border-slate-200/90 col-span-2 lg:col-span-1">
                        <div class="flex items-center justify-between text-xs font-bold text-slate-500 mb-1.5">
                            <span class="uppercase tracking-wider text-[10px]">Fulfillment</span>
                            <span class="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xs shadow-2xs"><i class="fa-solid fa-truck-fast"></i></span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap mt-2">
                            <span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs flex items-center gap-1" title="Shipped / In Transit">
                                <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                <span id="stat-shipped-orders">0</span> In-Transit
                            </span>
                            <span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs flex items-center gap-1" title="Cancelled">
                                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                <span id="stat-cancelled-orders">0</span> Cancelled
                            </span>
                        </div>
                    </div>
                </div>

                <!-- ORDERS TABLE CARD -->`;

html = html.replace(kpiMatch, newKpis);
console.log('Updated KPI Cards');

// 5. Refine Table Toolbar & Search Filters
const toolbarMatch = /<!-- TOOLBAR & FILTERS -->[\s\S]*?<!-- DATA TABLE -->/;
const newToolbar = `<!-- TOOLBAR & FILTERS -->
                    <div class="p-4 border-b border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70">
                        
                        <!-- Search Box -->
                        <div class="relative flex-grow max-w-lg">
                            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
                            <input type="text" id="order-search-input" oninput="debounceSearch()" placeholder="Search Order ID, Customer Name, Phone, City, Pincode, SKU, AWB..." class="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 bg-white placeholder-slate-400 font-semibold transition-all shadow-2xs text-slate-900">
                        </div>

                        <!-- Status & Provider Filters -->
                        <div class="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 flex-wrap">
                            <select id="filter-status" onchange="loadOrdersAndStats()" class="px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs cursor-pointer">
                                <option value="all">All Order Statuses</option>
                                <option value="LOCAL_DELIVERY">📍 Nearby Location (421305, 421302, 421308)</option>
                                <option value="OTP_NOT_VERIFIED">⚠️ COD (OTP Not Verified / Leads)</option>
                                <option value="DELIVERED">✓ Delivered (Settled)</option>
                                <option value="SHIPPED">Shipped / In Transit</option>
                                <option value="SHIPMENT_BOOKED">Shipment Booked</option>
                                <option value="PAYMENT_CAPTURED">Payment Captured</option>
                                <option value="PENDING_PAYMENT">Pending Payment</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>

                            <select id="filter-provider" onchange="loadOrdersAndStats()" class="px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs cursor-pointer">
                                <option value="all">All Payment Methods</option>
                                <option value="razorpay">Online Payment (Razorpay)</option>
                                <option value="cod">Cash on Delivery (COD)</option>
                            </select>

                            <button type="button" onclick="clearAllFilters()" class="action-btn px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5" title="Reset all search queries and dropdown filters">
                                <i class="fa-solid fa-filter-circle-xmark text-slate-400"></i>
                                <span>Clear Filters</span>
                            </button>
                        </div>
                    </div>

                    <!-- DATA TABLE -->`;

html = html.replace(toolbarMatch, newToolbar);
console.log('Updated Table Toolbar');

// 6. Refine Table Header
const theadMatch = /<thead class="[\s\S]*?<\/thead>/;
const newThead = `<thead class="bg-slate-50/90 text-slate-600 font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200/90 select-none">
                                <tr>
                                    <th class="py-3.5 px-4">Order ID & Date</th>
                                    <th class="py-3.5 px-4">Customer Details</th>
                                    <th class="py-3.5 px-4 min-w-[250px]">Items & Selected Products</th>
                                    <th class="py-3.5 px-4">Total Amount</th>
                                    <th class="py-3.5 px-4">Payment Method</th>
                                    <th class="py-3.5 px-4">Shipping / AWB</th>
                                    <th class="py-3.5 px-4">Delivery Settlement</th>
                                    <th class="py-3.5 px-4 text-right">Actions</th>
                                </tr>
                            </thead>`;

html = html.replace(theadMatch, newThead);
console.log('Updated Table Header');

// 7. Refine renderOrdersTable function implementation
const renderOrdersFnStart = 'function renderOrdersTable(orders, summary) {';
const exportExcelStart = '// ==========================================\n        // EXPORT TO EXCEL (.XLSX)';
const rStartIdx = html.indexOf(renderOrdersFnStart);
const rEndIdx = html.indexOf(exportExcelStart);

if (rStartIdx !== -1 && rEndIdx !== -1) {
    const newRenderOrdersCode = `function renderOrdersTable(orders, summary) {
            const tbody = document.getElementById('orders-table-body');
            const countSummary = document.getElementById('table-count-summary');
            const revSummary = document.getElementById('table-revenue-summary');
            const deliveredSummary = document.getElementById('table-delivered-summary');
            const itemsSummary = document.getElementById('table-items-summary');

            if (!tbody) return;

            // Calculate live totals from list
            let totalRev = 0;
            let deliveredRev = 0;
            let totalUnits = 0;
            for (const o of orders) {
                const isCancelled = (o.status || '').toUpperCase() === 'CANCELLED';
                const total = o.pricing?.total || 0;
                if (!isCancelled) {
                    totalRev += total;
                    if ((o.status || '').toUpperCase() === 'DELIVERED') {
                        deliveredRev += total;
                    }
                }
                for (const item of (o.items || [])) {
                    totalUnits += (item.quantity || 1);
                }
            }

            if (summary && summary.filteredRevenue !== undefined) {
                totalRev = summary.filteredRevenue;
                deliveredRev = summary.filteredDeliveredRevenue || deliveredRev;
                totalUnits = summary.filteredItemsCount;
            }

            if (countSummary) countSummary.textContent = \`Showing \${orders.length} \${orders.length === 1 ? 'order' : 'orders'}\`;
            if (revSummary) revSummary.textContent = \`Filtered Booked: Rs. \${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`;
            if (deliveredSummary) deliveredSummary.textContent = \`Delivered: Rs. \${deliveredRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\`;
            if (itemsSummary) itemsSummary.textContent = \`\${totalUnits} Total Units\`;

            if (orders.length === 0) {
                tbody.innerHTML = \`
                    <tr>
                        <td colspan="8" class="text-center py-16 text-slate-400">
                            <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-xl mx-auto mb-2 border border-slate-200">
                                <i class="fa-solid fa-box-open"></i>
                            </div>
                            <div class="text-xs font-bold text-slate-600">No matching orders found</div>
                            <div class="text-[11px] text-slate-400 mt-0.5">Try clearing your filters or selecting a wider date range</div>
                        </td>
                    </tr>
                \`;
                return;
            }

            tbody.innerHTML = orders.map(order => {
                const orderId = order.orderId || 'N/A';
                const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
                const customerName = (order.customer && order.customer.name) || 'Customer';
                const customerPhone = (order.customer && order.customer.phone) || '-';
                const customerCity = (order.customer && order.customer.city) || '';
                const customerPincode = (order.customer && order.customer.pincode) || '';
                const itemsCount = (order.items || []).reduce((s, i) => s + (i.quantity || 1), 0);
                const total = order.pricing ? \`Rs. \${parseFloat(order.pricing.total).toFixed(2)}\` : 'Rs. 0.00';
                
                const LOCAL_PINCODES = ['421305', '421302', '421308'];
                const isNearbyLocation = LOCAL_PINCODES.includes(String(customerPincode).trim()) || Boolean(order.isLocalDelivery);

                // Robust Payment Method & COD Detection
                const prov = (order.payment?.provider || order.paymentMethod || order.payment_method || '').toLowerCase();
                const hasCodCharge = (order.pricing?.codCharge || 0) > 0;
                const hasCodEvent = (order.events || []).some(e => (e.event || '').includes('COD'));
                const isCod = prov === 'cod' || prov === 'cash_on_delivery' || hasCodCharge || hasCodEvent;

                const paymentStatus = ((order.payment && order.payment.status) || (isCod ? 'COD_PENDING' : 'PENDING')).toUpperCase();
                const shippingStatus = ((order.shipping && order.shipping.status) || 'NOT_BOOKED').toUpperCase();
                const awb = order.shipping && order.shipping.awb;
                const courierName = order.shipping && order.shipping.courierName;
                const status = (order.status || 'PENDING').toUpperCase();
                const isDelivered = status === 'DELIVERED';
                const isCodOtpPending = isCod && (status === 'OTP_NOT_VERIFIED' || paymentStatus === 'OTP_NOT_VERIFIED' || shippingStatus === 'OTP_NOT_VERIFIED');
                const isOnlinePaid = !isCod && (paymentStatus === 'CAPTURED' || status === 'PAYMENT_CAPTURED' || status === 'SHIPMENT_BOOKED' || status === 'SHIPPED' || status === 'DELIVERED' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' || Boolean(order.payment && (order.payment.razorpayPaymentId || order.payment.status === 'CAPTURED')));

                let paymentBadge = '';
                let shippingDisplay = '';

                const courierProvider = (order.shipping?.provider || (order.shipping?.shiprocketOrderId ? 'shiprocket' : (order.shipping?.waybill ? 'delhivery' : ''))).toLowerCase();
                const isShipmentBooked = Boolean(awb || order.shipping?.shiprocketOrderId || order.shipping?.waybill);

                if (isCod) {
                    if (isCodOtpPending) {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1.5 shadow-2xs"><i class="fa-solid fa-clock text-amber-600 text-[10px]"></i> COD (OTP Pending)</span>\`;
                        shippingDisplay = \`<div class="text-[10.5px] font-bold text-amber-700 flex items-center gap-1"><i class="fa-solid fa-triangle-exclamation text-amber-600"></i> OTP Not Entered</div>\`;
                    } else if (isDelivered) {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs flex items-center gap-1.5"><i class="fa-solid fa-hand-holding-dollar text-emerald-600 text-[10px]"></i> COD Settled</span>\`;
                        shippingDisplay = \`
                            <div class="font-mono text-xs font-bold text-emerald-800">\${awb || 'Delivered'}</div>
                            <div class="text-[10px] text-emerald-700 font-semibold flex items-center gap-1"><i class="fa-solid fa-circle-check text-[9.5px]"></i> Settled</div>
                        \`;
                    } else if (isShipmentBooked || ['SHIPMENT_BOOKED', 'SHIPPED', 'IN_TRANSIT'].includes(status)) {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-50 text-amber-900 border border-amber-200/90 shadow-2xs flex items-center gap-1.5"><i class="fa-solid fa-hand-holding-dollar text-amber-600 text-[10px]"></i> COD</span>\`;
                        const cLabel = courierProvider === 'delhivery' ? 'Delhivery' : 'Shiprocket';
                        const cColor = courierProvider === 'delhivery' ? 'text-rose-700' : 'text-indigo-700';
                        const cIcon = courierProvider === 'delhivery' ? 'fa-box text-rose-600' : 'fa-truck-fast text-indigo-600';
                        shippingDisplay = \`
                            <div class="font-mono text-xs font-bold \${cColor}">\${awb || 'Booked'}</div>
                            <div class="text-[10.5px] text-slate-600 font-semibold flex items-center gap-1 mt-0.5"><i class="fa-solid \${cIcon} text-[9.5px]"></i> \${cLabel}</div>
                        \`;
                    } else if (status === 'CANCELLED') {
                        paymentBadge = \`<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">COD (Cancelled)</span>\`;
                        shippingDisplay = \`<span class="text-[10.5px] text-rose-700 font-semibold">Cancelled</span>\`;
                    } else {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs flex items-center gap-1.5"><i class="fa-solid fa-hand-holding-dollar text-amber-600 text-[10px]"></i> COD</span>\`;
                        if (isNearbyLocation) {
                            shippingDisplay = \`
                                <div class="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1 w-max">
                                    <i class="fa-solid fa-location-dot text-[9px] text-purple-600"></i> Nearby • Hand-Deliver
                                </div>
                                <div class="text-[9.5px] text-purple-600 font-medium mt-0.5">Free Delivery (PIN: \${customerPincode})</div>
                            \`;
                        } else {
                            shippingDisplay = \`<span class="text-[10.5px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1 w-max"><i class="fa-solid fa-clock text-[9px]"></i> Ready for Courier</span>\`;
                        }
                    }
                } else {
                    // Online (Razorpay)
                    if (isOnlinePaid || isDelivered) {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs flex items-center gap-1.5"><i class="fa-solid fa-bolt text-emerald-600 text-[10px]"></i> Online Paid</span>\`;
                        if (isShipmentBooked) {
                            const cLabel = courierProvider === 'delhivery' ? 'Delhivery' : 'Shiprocket';
                            const cColor = courierProvider === 'delhivery' ? 'text-rose-700' : 'text-indigo-700';
                            const cIcon = courierProvider === 'delhivery' ? 'fa-box text-rose-600' : 'fa-truck-fast text-indigo-600';
                            shippingDisplay = \`
                                <div class="font-mono text-xs font-bold \${cColor}">\${awb || 'Booked'}</div>
                                <div class="text-[10.5px] text-slate-600 font-semibold flex items-center gap-1 mt-0.5"><i class="fa-solid \${cIcon} text-[9.5px]"></i> \${cLabel}</div>
                            \`;
                        } else {
                            if (isNearbyLocation) {
                                shippingDisplay = \`
                                    <div class="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1 w-max">
                                        <i class="fa-solid fa-location-dot text-[9px] text-purple-600"></i> Nearby • Hand-Deliver
                                    </div>
                                    <div class="text-[9.5px] text-purple-600 font-medium mt-0.5">Free Delivery (PIN: \${customerPincode})</div>
                                \`;
                            } else {
                                shippingDisplay = \`<span class="text-[10.5px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1 w-max"><i class="fa-solid fa-clock text-[9px]"></i> Ready for Courier</span>\`;
                            }
                        }
                    } else if (status === 'CANCELLED') {
                        paymentBadge = \`<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Online (Cancelled)</span>\`;
                        shippingDisplay = \`<span class="text-[10.5px] text-rose-700 font-semibold">Cancelled</span>\`;
                    } else {
                        paymentBadge = \`<span class="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs flex items-center gap-1.5"><i class="fa-solid fa-hourglass-half text-amber-600 text-[10px]"></i> Payment Pending</span>\`;
                        shippingDisplay = \`<span class="text-[10.5px] font-semibold text-slate-400">Awaiting Online Payment</span>\`;
                    }
                }

                // 1-Click Delivered Toggle Button Cell
                let deliveredActionCell = '';
                if (status === 'CANCELLED') {
                    deliveredActionCell = \`<span class="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">CANCELLED</span>\`;
                } else if (isCodOtpPending) {
                    deliveredActionCell = \`<span class="text-[10.5px] text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">OTP Pending</span>\`;
                } else if (isDelivered) {
                    deliveredActionCell = \`
                        <button onclick="toggleDeliveredStatus('\${orderId}', false)" class="action-btn px-3 py-1.5 bg-emerald-600 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer group" title="Click to Uncheck / Revert Delivery status">
                            <i class="fa-solid fa-circle-check text-xs group-hover:hidden"></i>
                            <i class="fa-solid fa-rotate-left text-xs hidden group-hover:inline"></i>
                            <span class="group-hover:hidden">Delivered</span>
                            <span class="hidden group-hover:inline">Revert</span>
                        </button>
                    \`;
                } else {
                    deliveredActionCell = \`
                        <button onclick="toggleDeliveredStatus('\${orderId}', true)" class="action-btn px-3 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-300 hover:border-emerald-500 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Click to mark this order as Delivered">
                            <i class="fa-regular fa-circle-check text-slate-400 text-xs"></i>
                            <span>Mark Delivered</span>
                        </button>
                    \`;
                }

                return \`
                    <tr class="hover:bg-slate-50/80 transition-colors \${isDelivered ? 'bg-emerald-50/15' : (isCodOtpPending ? 'bg-amber-50/15' : (isNearbyLocation ? 'bg-purple-50/15' : ''))}">
                        <td class="py-3.5 px-4 font-mono font-bold text-indigo-600">
                            <button onclick="openOrderDetail('\${orderId}')" class="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 hover:underline font-mono font-black text-xs cursor-pointer group">
                                <span>\${orderId}</span>
                                <i class="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
                            </button>
                            <div class="text-[10px] font-medium text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                                <i class="fa-regular fa-clock text-[9px]"></i>
                                <span>\${dateStr}</span>
                            </div>
                        </td>
                        <td class="py-3.5 px-4">
                            <div class="flex items-start gap-2.5">
                                <div class="w-8 h-8 rounded-xl \${isNearbyLocation ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'} font-black text-xs flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                                    \${(customerName[0] || 'C').toUpperCase()}
                                </div>
                                <div>
                                    <div class="font-bold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                                        <span>\${customerName}</span>
                                        \${isNearbyLocation ? \`<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">📍 Nearby</span>\` : ''}
                                    </div>
                                    <div class="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 flex-wrap">
                                        <span class="font-mono text-slate-600 font-semibold">\${customerPhone}</span>
                                        <span class="text-slate-300">•</span>
                                        <span>\${customerCity}</span>
                                        <b class="text-slate-800">\${customerPincode}</b>
                                    </div>
                                    \${isNearbyLocation ? \`<div class="text-[10px] font-bold text-purple-700 flex items-center gap-1 mt-1 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-200/60 w-max"><i class="fa-solid fa-person-walking text-[9px]"></i> Free delivery • Hand-deliver order</div>\` : ''}
                                </div>
                            </div>
                        </td>
                        <td class="py-3.5 px-4">
                            \${renderAdminItemsCell(order)}
                        </td>
                        <td class="py-3.5 px-4 font-black text-slate-900 text-xs sm:text-sm tracking-tight whitespace-nowrap">\${total}</td>
                        <td class="py-3.5 px-4">\${paymentBadge}</td>
                        <td class="py-3.5 px-4">
                            \${shippingDisplay}
                        </td>
                        <td class="py-3.5 px-4">
                            \${deliveredActionCell}
                        </td>
                        <td class="py-3.5 px-4 text-right">
                            <div class="flex items-center justify-end gap-1.5 flex-wrap">
                                <button onclick="openWhatsAppModal('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Send WhatsApp Message">
                                    <i class="fa-brands fa-whatsapp text-emerald-600 text-xs"></i>
                                    <span>WhatsApp</span>
                                </button>
                                \${!isShipmentBooked && status !== 'CANCELLED' ? \`
                                    <button onclick="moveOrderToCourier('\${orderId}', 'shiprocket')" class="action-btn px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Ship with Shiprocket">
                                        <i class="fa-solid fa-truck-fast text-xs"></i>
                                        <span>Shiprocket</span>
                                    </button>
                                    <button onclick="openDelhiveryDispatchModal('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200/90 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Ship with Delhivery">
                                        <i class="fa-solid fa-box text-xs"></i>
                                        <span>Delhivery</span>
                                    </button>
                                \` : ''}
                                \${isShipmentBooked ? \`
                                    <a href="/api/shipments/\${orderId}/label?redirect=1" target="_blank" class="action-btn px-2.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Download Shipping Label">
                                        <i class="fa-solid fa-tag text-xs"></i>
                                        <span>Label</span>
                                    </a>
                                    \${order.shipping?.trackingUrl ? \`
                                        <a href="\${order.shipping.trackingUrl}" target="_blank" class="action-btn px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Track Shipment">
                                            <i class="fa-solid fa-location-arrow text-xs"></i>
                                            <span>Track</span>
                                        </a>
                                    \` : ''}
                                    \${courierProvider === 'delhivery' ? \`
                                        <button onclick="openDelhiveryUpdateModal('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Update Delhivery shipment">
                                            <i class="fa-solid fa-pen-to-square text-xs"></i>
                                            <span>Update</span>
                                        </button>
                                    \` : ''}
                                \` : ''}
                                \${status !== 'CANCELLED' ? \`
                                    <button onclick="openChangeProductModal('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-indigo-50/60 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs" title="Change Customer Product">
                                        <i class="fa-solid fa-repeat text-xs"></i>
                                        <span>Change</span>
                                    </button>
                                \` : ''}
                                <button onclick="openOrderDetail('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs" title="View Order Details">
                                    <span>View</span>
                                </button>
                                \${status !== 'CANCELLED' ? \`
                                    <button onclick="promptCancelOrder('\${orderId}')" class="action-btn px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-700 hover:text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs" title="Cancel this order">
                                        <span>Cancel</span>
                                    </button>
                                \` : ''}
                                <button onclick="promptPermanentDeleteOrder('\${orderId}')" class="action-btn p-1.5 px-2 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200/90 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs" title="Permanently delete order">
                                    <i class="fa-solid fa-trash-can text-xs"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                \`;
            }).join('');
        }\n\n        `;
    html = html.substring(0, rStartIdx) + newRenderOrdersCode + html.substring(rEndIdx);
    console.log('Updated renderOrdersTable Function');
}

fs.writeFileSync(adminPath, html, 'utf8');
console.log('Successfully written new admin.html! New file size:', html.length);

