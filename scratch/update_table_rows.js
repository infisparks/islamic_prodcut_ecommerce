const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, '..', 'admin.html');
let html = fs.readFileSync(adminPath, 'utf8');

const rStartStr = 'function renderOrdersTable(orders, summary) {';
const rEndStr = 'function exportToExcel() {';

const rStartIdx = html.indexOf(rStartStr);
const rEndIdx = html.indexOf(rEndStr);

console.log('rStartIdx:', rStartIdx, 'rEndIdx:', rEndIdx);

if (rStartIdx !== -1 && rEndIdx !== -1) {
    // find the comment block right before exportToExcel
    const commentIdx = html.lastIndexOf('// EXPORT TO EXCEL', rEndIdx);
    const cutEndIdx = commentIdx !== -1 ? html.lastIndexOf('//', commentIdx) : rEndIdx;

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
        }

        `;

    html = html.substring(0, rStartIdx) + newRenderOrdersCode + html.substring(cutEndIdx);
    fs.writeFileSync(adminPath, html, 'utf8');
    console.log('Successfully updated renderOrdersTable!');
}

