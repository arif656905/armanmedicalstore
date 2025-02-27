document.addEventListener('DOMContentLoaded', function() {
    // Initialize invoice date and time with current values
    updateDateTimeFields();

    // Generate initial invoice number
    generateNewInvoiceNumber();

    // Load products for dropdown
    loadMedicineList();

    // Add event listeners
    document.getElementById('addRow').addEventListener('click', addProductRow);
    document.getElementById('printInvoice').addEventListener('click', handlePrintInvoice);
    document.getElementById('resetInvoice').addEventListener('click', resetInvoice);
    document.getElementById('addMedicine').addEventListener('click', () => showAddMedicineModal());

    // Add initial row
    addProductRow();
});

function updateDateTimeFields() {
    const now = new Date();
    document.getElementById('invoiceDate').value = now.toISOString().split('T')[0];
    document.getElementById('invoiceTime').value = now.toTimeString().slice(0,5);
}

function generateNewInvoiceNumber() {
    fetch('/api/generate-invoice-number')
        .then(response => response.json())
        .then(data => {
            document.getElementById('invoiceNumber').value = data.invoice_number;
        });
}

function loadMedicineList() {
    fetch('/api/medicines')
        .then(response => response.json())
        .then(products => {
            window.productsList = Array.isArray(products) ? products : [];
            updateMedicineList();
            // Re-initialize product rows to update datalists
            const tbody = document.getElementById('productRows');
            if (tbody.children.length === 0) {
                addProductRow();
            }
        })
        .catch(error => {
            console.error('Error loading medicines:', error);
            window.productsList = [];
        });
}

function handlePrintInvoice() {
    // Validate required fields
    const customerName = document.getElementById('customerName').value;
    const customerPhone = document.getElementById('customerPhone').value;

    if (!customerName || !customerPhone) {
        alert('Please fill in customer name and phone number');
        return;
    }

    // Gather invoice data
    const invoiceData = {
        invoice_number: document.getElementById('invoiceNumber').value,
        date: document.getElementById('invoiceDate').value,
        time: document.getElementById('invoiceTime').value,
        customer: {
            name: customerName,
            age: document.getElementById('customerAge').value,
            phone: customerPhone,
            address: document.getElementById('customerAddress').value
        },
        items: [],
        sub_total: parseFloat(document.getElementById('subTotal').value || 0),
        gst_total: parseFloat(document.getElementById('gstTotal').value || 0),
        grand_total: parseFloat(document.getElementById('grandTotal').value || 0)
    };

    // Gather items data
    document.querySelectorAll('#productRows tr').forEach(row => {
        const particulars = row.querySelector('.particulars');
        if (particulars && particulars.value) {
            invoiceData.items.push({
                name: particulars.value,
                batch: row.querySelector('.batch').value,
                expiry: row.querySelector('.expiry').value,
                mrp: parseFloat(row.querySelector('.mrp').value || 0),
                quantity: parseInt(row.querySelector('.qty').value || 0),
                discount: parseFloat(row.querySelector('.discount').value || 0),
                gst: parseFloat(row.querySelector('.gst').value || 0),
                rate: parseFloat(row.querySelector('.rate').value || 0)
            });
        }
    });

    // Save invoice
    fetch('/api/invoices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.print();
            setTimeout(() => {
                if (confirm('Would you like to reset the invoice?')) {
                    resetInvoice();
                }
            }, 500);
        } else {
            alert('Error creating invoice: ' + data.error);
        }
    })
    .catch(error => {
        alert('Error creating invoice: ' + error);
    });
}

function resetInvoice() {
    // Clear customer details
    document.getElementById('customerName').value = '';
    document.getElementById('customerAge').value = '';
    document.getElementById('customerPhone').value = '';
    document.getElementById('customerAddress').value = '';

    // Reset date and time
    updateDateTimeFields();

    // Clear products table
    document.getElementById('productRows').innerHTML = '';
    addProductRow();

    // Reset totals
    document.getElementById('subTotal').value = '0.00';
    document.getElementById('gstTotal').value = '0.00';
    document.getElementById('grandTotal').value = '0.00';

    // Generate new invoice number
    generateNewInvoiceNumber();
}

function showAddMedicineModal(medicine = null) {
    const modalTemplate = document.getElementById('medicineModalTemplate');
    const modalElement = modalTemplate.content.cloneNode(true);
    document.body.appendChild(modalElement);

    const modal = document.querySelector('.modal');
    const modalTitle = modal.querySelector('.modal-title');
    const form = modal.querySelector('#medicineForm');
    const saveButton = modal.querySelector('#saveMedicine');

    // Set default expiry date to 1 year from now
    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1);

    if (medicine) {
        modalTitle.textContent = 'Edit Medicine';
        form.name.value = medicine.name;
        form.batch.value = medicine.batch;
        form.expiry.value = medicine.expiry.split('T')[0];
        form.mrp.value = medicine.mrp;
        form.gst.value = medicine.gst;
    } else {
        modalTitle.textContent = 'Add New Medicine';
        form.expiry.value = defaultExpiry.toISOString().split('T')[0];
    }

    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();

    saveButton.addEventListener('click', () => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Validate form data
        if (!data.name || !data.batch || !data.expiry || !data.mrp || !data.gst) {
            alert('Please fill in all required fields');
            return;
        }

        const url = medicine ? `/api/medicines/${medicine.id}` : '/api/medicines';
        const method = medicine ? 'PUT' : 'POST';

        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                modalInstance.hide();
                loadMedicineList();  // Reload medicines list
            } else {
                alert(result.error || 'Error saving medicine');
            }
        })
        .catch(error => {
            alert('Error saving medicine: ' + error);
        });
    });

    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

function addProductRow() {
    const tbody = document.getElementById('productRows');
    const row = document.createElement('tr');

    // Create datalist for medicine names
    const options = window.productsList?.map(p => `<option value="${p.name}">`).join('') || '';

    row.innerHTML = `
        <td>
            <input type="text" class="form-control-plain particulars" list="productsList" autocomplete="off">
            <datalist id="productsList">
                ${options}
            </datalist>
        </td>
        <td><input type="text" class="form-control-plain batch" readonly tabindex="-1"></td>
        <td><input type="date" class="form-control-plain expiry" readonly tabindex="-1"></td>
        <td><input type="number" class="form-control-plain mrp" step="0.01" readonly tabindex="-1"></td>
        <td><input type="number" class="form-control-plain qty" value="1" min="1"></td>
        <td><input type="number" class="form-control-plain discount" value="0" min="0" max="100"></td>
        <td><input type="number" class="form-control-plain gst" readonly tabindex="-1"></td>
        <td><input type="number" class="form-control-plain rate" readonly tabindex="-1"></td>
    `;

    tbody.appendChild(row);

    // Add event listeners for calculations
    const inputs = row.querySelectorAll('input');
    inputs.forEach(input => {
        if(['qty', 'discount'].includes(input.className.split(' ')[1])) {
            input.addEventListener('input', () => calculateRowTotal(row));
        }
    });

    // Handle product selection
    const particularsInput = row.querySelector('.particulars');
    particularsInput.addEventListener('input', () => {
        const product = window.productsList?.find(p => p.name === particularsInput.value);
        if (product) {
            row.querySelector('.batch').value = product.batch;
            row.querySelector('.expiry').value = product.expiry.split('T')[0];
            row.querySelector('.mrp').value = product.mrp;
            row.querySelector('.gst').value = product.gst;
            calculateRowTotal(row);
            // Focus on quantity field after selecting medicine
            row.querySelector('.qty').focus();
        }
    });

    return row;
}

function calculateRowTotal(row) {
    const mrp = parseFloat(row.querySelector('.mrp').value) || 0;
    const qty = parseInt(row.querySelector('.qty').value) || 0;
    const discount = parseFloat(row.querySelector('.discount').value) || 0;

    const discountAmount = (mrp * discount) / 100;
    const rate = mrp - discountAmount;

    row.querySelector('.rate').value = (rate * qty).toFixed(2);

    calculateTotals();
}

function calculateTotals() {
    let subTotal = 0;
    let gstTotal = 0;

    document.querySelectorAll('#productRows tr').forEach(row => {
        const rate = parseFloat(row.querySelector('.rate').value) || 0;
        const gstPercentage = parseFloat(row.querySelector('.gst').value) || 0;

        subTotal += rate;
        gstTotal += (rate * gstPercentage) / 100;
    });

    document.getElementById('subTotal').value = subTotal.toFixed(2);
    document.getElementById('gstTotal').value = gstTotal.toFixed(2);
    document.getElementById('grandTotal').value = (subTotal + gstTotal).toFixed(2);
}

function updateMedicineList() {
    const tbody = document.querySelector('#medicineList tbody');
    tbody.innerHTML = '';

    if (!window.productsList || !Array.isArray(window.productsList)) return;

    window.productsList.forEach(product => {
        const row = document.createElement('tr');
        const expiryDate = new Date(product.expiry);
        const today = new Date();
        const monthsUntilExpiry = (expiryDate - today) / (1000 * 60 * 60 * 24 * 30);

        let expiryClass = 'normal';
        if (expiryDate < today) {
            expiryClass = 'expired';
        } else if (monthsUntilExpiry <= 3) {
            expiryClass = 'expiring-soon';
        }

        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.batch}</td>
            <td class="${expiryClass}">${product.expiry.split('T')[0]}</td>
            <td>${product.mrp.toFixed(2)}</td>
            <td class="d-print-none">
                <button class="btn btn-sm btn-primary edit-medicine" data-id="${product.id}">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn btn-sm btn-danger delete-medicine" data-id="${product.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </td>
        `;

        // Add edit button handler
        row.querySelector('.edit-medicine').addEventListener('click', () => {
            const medicineToEdit = window.productsList.find(m => m.id === product.id);
            if (medicineToEdit) {
                showAddMedicineModal(medicineToEdit);
            }
        });

        // Add delete button handler
        row.querySelector('.delete-medicine').addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this medicine?')) {
                fetch(`/api/medicines/${product.id}`, {
                    method: 'DELETE'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        loadMedicineList();  // Reload the list after deletion
                    } else {
                        alert('Error deleting medicine: ' + data.error);
                    }
                })
                .catch(error => {
                    alert('Error deleting medicine: ' + error);
                });
            }
        });

        tbody.appendChild(row);
    });
}

// Load and display customer records
function loadCustomerRecords() {
    fetch('/api/customer-records')
        .then(response => response.json())
        .then(records => {
            const tbody = document.querySelector('#customerRecords tbody');
            tbody.innerHTML = '';

            records.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${record.date} ${record.time}</td>
                    <td>${record.invoice_number}</td>
                    <td>${record.customer_name}</td>
                    <td>${record.phone}</td>
                    <td>${record.total.toFixed(2)}</td>
                    <td class="d-print-none">
                        <button class="btn btn-sm btn-primary view-invoice" data-id="${record.id}">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-sm btn-success export-pdf" data-id="${record.id}">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                    </td>
                `;

                // Add view invoice handler
                row.querySelector('.view-invoice').addEventListener('click', function() {
                    const invoiceId = this.getAttribute('data-id');
                    viewInvoiceDetails(invoiceId);
                });

                tbody.appendChild(row);
            });
        });
}

function viewInvoiceDetails(invoiceId) {
    fetch(`/api/invoice/${invoiceId}`)
        .then(response => response.json())
        .then(invoice => {
            // Fill in the invoice form with the retrieved data
            document.getElementById('customerName').value = invoice.customer.name;
            document.getElementById('customerAge').value = invoice.customer.age || '';
            document.getElementById('customerPhone').value = invoice.customer.phone;
            document.getElementById('customerAddress').value = invoice.customer.address || '';
            document.getElementById('invoiceNumber').value = invoice.invoice_number;
            document.getElementById('invoiceDate').value = invoice.date;
            document.getElementById('invoiceTime').value = invoice.time;

            // Clear existing rows and add invoice items
            document.getElementById('productRows').innerHTML = '';
            invoice.items.forEach(item => {
                const row = addProductRow();
                row.querySelector('.particulars').value = item.name;
                row.querySelector('.batch').value = item.batch;
                row.querySelector('.expiry').value = item.expiry.split('T')[0];
                row.querySelector('.mrp').value = item.mrp;
                row.querySelector('.qty').value = item.quantity;
                row.querySelector('.discount').value = item.discount;
                row.querySelector('.gst').value = item.gst;
                row.querySelector('.rate').value = (item.rate * item.quantity).toFixed(2);
            });

            // Update totals
            document.getElementById('subTotal').value = invoice.sub_total.toFixed(2);
            document.getElementById('gstTotal').value = invoice.gst_total.toFixed(2);
            document.getElementById('grandTotal').value = invoice.grand_total.toFixed(2);

            // Switch to invoice tab
            document.querySelector('a[href="#invoice"]').click();
        });
}

// Initialize customer records when the tab is shown
document.querySelector('a[href="#customers"]').addEventListener('show.bs.tab', loadCustomerRecords);