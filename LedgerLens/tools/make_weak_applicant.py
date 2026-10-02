"""Weak applicant, Jan–Mar 2025: expected outcome DECLINE.

Profile: salary ~₹52k (one month short), three EMIs totalling ₹38,200 (FOIR ~74%, above the 65% hard limit),
EMI debits that bounce for insufficient funds, overdraft (negative-balance) days, minimum-balance charges,
P2P borrowing from friends, and an instant-loan disbursal in March. All data synthetic.

Run from the LedgerLens folder:  python3 tools/make_weak_applicant.py
"""
import re
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas


def fmt(x):
    s = f"{abs(x):,.2f}"
    ip, dp = s.split('.'); ip = ip.replace(',', '')
    if len(ip) > 3:
        head, tail = ip[:-3], ip[-3:]
        head = re.sub(r'(\d)(?=(\d\d)+$)', r'\1,', head)
        ip = head + ',' + tail
    return ('-' if x < 0 else '') + ip + '.' + dp


MON = ['JAN', 'FEB', 'MAR']
rows = []  # (month, day, narration, amount, 'D'/'C')
def add(m, d, n, a, t): rows.append((m, d, n, a, t))

for m in (1, 2, 3):
    M = MON[m - 1]
    # EMIs fall due before salary arrives
    add(m, 2, f'ACH D-HDFC LTD-LN0071234567-HOME LOAN EMI {M}', 24800, 'D')
    if m in (2, 3):
        add(m, 4, f'ACH D-BAJAJ FINANCE LTD-LN4409912345-EMI {M}', 9950, 'D')
        add(m, 4, 'ACH RTN-BAJAJ FINANCE LTD-LN4409912345-INSUFFICIENT FUNDS', 9950, 'C')
        add(m, 5, 'NACH RTN CHGS-LN4409912345 INCL GST', 590, 'D')
    else:
        add(m, 4, f'ACH D-BAJAJ FINANCE LTD-LN4409912345-EMI {M}', 9950, 'D')
    add(m, 5, f'ACH D-TVS CREDIT SERVICES-LN8812300456-TWO WHEELER EMI {M}', 3450, 'D')
    add(m, 7, f'NEFT CR-ICIC0000331-SUNRISE LOGISTICS PVT LTD-SALARY {M} 2025-N02500{m}77', 48500 if m == 2 else 52000, 'C')
    add(m, 8, 'UPI-RELIANCE FRESH-reliancefresh@icici-ICIC0000008-50190000' + str(m) + '1-UPI', 2860 + m * 75, 'D')
    add(m, 9, 'BIL/ONL/000512' + str(m) + '45/MSEDCL/' + M + '25', 1420 + m * 30, 'D')
    add(m, 10, 'NWD-508812XXXXXX3301-S1AN0456-PUNE', 4000, 'D')
    add(m, 12, 'UPI-JIO PREPAID-jio@sbi-SBIN0000009-50190000' + str(m) + '2-RECHARGE', 349, 'D')
    add(m, 14, 'IMPS-50190000' + str(m) + '3-PRAKASH JADHAV-SBIN-XXXXXXXX4410-HAND LOAN', 8000, 'C')
    add(m, 16, 'UPI-SWIGGY-swiggy@icici-ICIC0DC0099-50190000' + str(m) + '4-UPI', 540, 'D')
    add(m, 18, 'UPI-DMART READY-dmart@icici-ICIC0000006-50190000' + str(m) + '5-UPI', 1980, 'D')
    add(m, 22, 'IMPS-50190000' + str(m) + '6-PRAKASH JADHAV-SBIN-XXXXXXXX4410-RETURN', 5000, 'D')
    add(m, 25, 'NWD-508812XXXXXX3301-S1AN0456-PUNE', 3000, 'D')
    add(m, 28, 'MIN BAL CHG ' + M + ' 25 INCL GST', 354, 'D')
add(3, 11, 'NEFT CR-HDFC0000999-QUICKCASH FINTECH-LOAN DISB LN-QC88123', 25000, 'C')
add(3, 20, 'UPI-AMAZON PAY INDIA PRIVA-amazonpay@apl-UTIB0000002-501900099-ORDER', 6499, 'D')

rows.sort(key=lambda r: (r[0], r[1]))
opening = 6200.00
lines = []; b = opening; neg_days = 0
for m, d, n, a, t in rows:
    b = round(b - a if t == 'D' else b + a, 2)
    dt = f"{d:02d}/{m:02d}/2025"
    lines.append((dt, dt, n, fmt(a) if t == 'D' else '', fmt(a) if t == 'C' else '', fmt(b)))
closing = b

hdr = {'bank': 'DECCAN COOPERATIVE BANK', 'Account Holder': 'SURESH PATIL', 'Account Number': '60112233445566',
       'Account Type': 'Savings - Individual (OD linked)', 'Currency': 'INR', 'Branch': 'Hadapsar, Pune',
       'Statement Period': '01/01/2025 to 31/03/2025', 'Opening Balance': fmt(opening)}

path = 'test-statements/06_weak_applicant_3_months.pdf'
c = canvas.Canvas(path, pagesize=landscape(A4)); W, H = landscape(A4)
per_page = 18
pages = [lines[i:i + per_page] for i in range(0, len(lines), per_page)]
N = len(pages)
cols = [36, 96, 156, 600, 670, 740]
for pi, pl in enumerate(pages):
    y = H - 40
    c.setFont('Helvetica-Bold', 13); c.drawString(36, y, hdr['bank'] + '  |  Statement of Account'); y -= 18
    if pi == 0:
        c.setFont('Helvetica', 9)
        for k in ['Account Holder', 'Account Number', 'Account Type', 'Currency', 'Branch', 'Statement Period', 'Opening Balance']:
            c.drawString(36, y, f"{k}: {hdr[k]}"); y -= 12
        y -= 6
    c.setFont('Helvetica-Bold', 8)
    for x, h in zip(cols, ['Date', 'Value Date', 'Narration', 'Debit', 'Credit', 'Balance']): c.drawString(x, y, h)
    y -= 12; c.setFont('Helvetica', 7.4)
    for r in pl:
        c.drawString(cols[0], y, r[0]); c.drawString(cols[1], y, r[1]); c.drawString(cols[2], y, r[2][:88])
        c.drawRightString(cols[3] + 55, y, r[3]); c.drawRightString(cols[4] + 55, y, r[4]); c.drawRightString(cols[5] + 60, y, r[5]); y -= 13
    if pi == N - 1:
        y -= 8; c.setFont('Helvetica-Bold', 8.5); c.drawString(36, y, 'Closing Balance: ' + fmt(closing))
    c.setFont('Helvetica', 8); c.drawString(36, 24, f"Page {pi + 1} of {N}")
    c.drawRightString(W - 36, 24, 'This is a computer-generated synthetic statement for testing — not a real account.')
    c.showPage()
c.save()
print(path, len(rows), 'rows,', N, 'pages, closing', fmt(closing), '| min balance', fmt(min(float(l[5].replace(',', '')) for l in lines)))
