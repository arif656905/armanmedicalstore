import os
import json
from datetime import datetime
from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")

# Configure SQLAlchemy
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}
db.init_app(app)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/medicines', methods=['GET'])
def get_medicines():
    from models import Medicine
    medicines = Medicine.query.filter_by(is_active=True).all()
    return jsonify([{
        'id': m.id,
        'name': m.name,
        'batch': m.batch,
        'expiry': m.expiry.isoformat(),
        'mrp': m.mrp,
        'gst': m.gst
    } for m in medicines])

@app.route('/api/medicines', methods=['POST'])
def add_medicine():
    from models import Medicine
    try:
        data = request.json
        medicine = Medicine(
            name=data['name'],
            batch=data['batch'],
            expiry=datetime.strptime(data['expiry'], '%Y-%m-%d').date(),
            mrp=float(data['mrp']),
            gst=float(data['gst'])
        )
        db.session.add(medicine)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Medicine added successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/medicines/<int:id>', methods=['PUT'])
def update_medicine(id):
    from models import Medicine
    try:
        medicine = Medicine.query.get_or_404(id)
        data = request.json
        medicine.name = data['name']
        medicine.batch = data['batch']
        medicine.expiry = datetime.strptime(data['expiry'], '%Y-%m-%d').date()
        medicine.mrp = float(data['mrp'])
        medicine.gst = float(data['gst'])
        db.session.commit()
        return jsonify({'success': True, 'message': 'Medicine updated successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/medicines/<int:id>', methods=['DELETE'])
def delete_medicine(id):
    from models import Medicine
    try:
        medicine = Medicine.query.get_or_404(id)
        medicine.is_active = False  # Soft delete
        db.session.commit()
        return jsonify({'success': True, 'message': 'Medicine deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/generate-invoice-number')
def generate_invoice_number():
    timestamp = datetime.now().strftime('%Y%m%d%H%M')
    return jsonify({"invoice_number": f"INV-{timestamp}"})

@app.route('/api/invoices', methods=['POST'])
def create_invoice():
    from models import Customer, Invoice, InvoiceItem, Medicine
    try:
        data = request.json

        # Validate required fields
        if not data['customer']['name'] or not data['customer']['phone']:
            return jsonify({'success': False, 'error': 'Customer name and phone are required'}), 400

        # Create or update customer
        customer = Customer(
            name=data['customer']['name'],
            age=int(data['customer']['age']) if data['customer']['age'] else None,
            phone=data['customer']['phone'],
            address=data['customer']['address']
        )
        db.session.add(customer)
        db.session.flush()

        # Create invoice
        invoice_time = datetime.strptime(data['time'], '%H:%M').time()
        invoice = Invoice(
            invoice_number=data['invoice_number'],
            date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
            time=invoice_time,
            customer_id=customer.id,
            sub_total=data['sub_total'],
            gst_total=data['gst_total'],
            grand_total=data['grand_total']
        )
        db.session.add(invoice)
        db.session.flush()

        # Add invoice items
        for item in data['items']:
            if not item.get('name'):
                continue
            medicine = Medicine.query.filter_by(name=item['name'], is_active=True).first()
            if medicine:
                invoice_item = InvoiceItem(
                    invoice_id=invoice.id,
                    medicine_id=medicine.id,
                    quantity=item['quantity'],
                    mrp=item['mrp'],
                    discount=item['discount'],
                    gst=item['gst'],
                    rate=item['rate']
                )
                db.session.add(invoice_item)

        db.session.commit()
        return jsonify({'success': True, 'message': 'Invoice created successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/customer-records')
def get_customer_records():
    from models import Invoice
    records = Invoice.query.order_by(Invoice.date.desc(), Invoice.time.desc()).all()
    return jsonify([{
        'id': record.id,
        'date': record.date.isoformat(),
        'time': record.time.strftime('%H:%M'),
        'invoice_number': record.invoice_number,
        'customer_name': record.customer.name,
        'phone': record.customer.phone,
        'total': record.grand_total
    } for record in records])

@app.route('/api/invoice/<int:id>')
def get_invoice_details(id):
    from models import Invoice
    invoice = Invoice.query.get_or_404(id)
    return jsonify({
        'invoice_number': invoice.invoice_number,
        'date': invoice.date.isoformat(),
        'time': invoice.time.strftime('%H:%M'),
        'customer': {
            'name': invoice.customer.name,
            'age': invoice.customer.age,
            'phone': invoice.customer.phone,
            'address': invoice.customer.address
        },
        'items': [{
            'name': item.medicine.name,
            'batch': item.medicine.batch,
            'expiry': item.medicine.expiry.isoformat(),
            'quantity': item.quantity,
            'mrp': item.mrp,
            'discount': item.discount,
            'gst': item.gst,
            'rate': item.rate
        } for item in invoice.items],
        'sub_total': invoice.sub_total,
        'gst_total': invoice.gst_total,
        'grand_total': invoice.grand_total
    })

with app.app_context():
    import models
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)