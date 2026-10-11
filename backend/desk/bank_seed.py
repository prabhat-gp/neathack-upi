"""An additive, isolated bank-ledger fixture. Never resets existing demo cases."""
from datetime import timedelta
from sandbox import db

PREFIX = 'BK-'


def seed():
    db.ex('CREATE TABLE IF NOT EXISTS bank_run_state (run_id TEXT PRIMARY KEY, payload TEXT)')
    if db.q1("SELECT id FROM desk_cases WHERE id LIKE 'BK-%' LIMIT 1"):
        return
    now = db.now()
    customers = db.q("SELECT * FROM cbs_customers WHERE status='ACTIVE' ORDER BY id")
    with db._lock:
        conn = db.conn()
        conn.execute('BEGIN')
        try:
            for i in range(1, 23):
                cid = f'BK-{i:03d}'
                utr = f'71100000{i:04d}'
                customer = customers[(i - 1) % len(customers)]
                amount = ([2450, 1800, 6200, 980, 4350, 8200, 3600][(i-1)%7] if i<=20 else (12500 if i==21 else 18500))*100
                if i in (12,19): amount = 11200 * 100
                # Today's ledger first, in ascending transaction order, then prior days.
                day = 0 if i <= 14 else (1 if i <= 19 else 2)
                at = db.iso((now - timedelta(days=day)).replace(hour=0, minute=i*2, second=0))
                if at > db.iso(now):
                    at = db.iso(now - timedelta(seconds=23-i))
                inward = i in (3,8,13,18)
                merchant = i in (5,10,15)
                conflict = i in (7,17)
                remitter_fault = i in (4,9,14,19)
                network_fault = i in (2,6,11,16,20)
                payee = 'annapurna.mart@narmada' if merchant else 'amit.k@kaveri'
                other = 'Narmada Bank' if merchant else 'Kaveri Bank'
                kind = 'P2M' if merchant else 'P2P'
                reason = ('Receiving bank credit posting controls rejected the payment' if inward else
                          'Remitter reversal worker failed after payment rejection' if remitter_fault else
                          'NPCI routing timeout before beneficiary acknowledgement' if network_fault else
                          'Conflicting credit confirmations require reconciliation' if conflict else
                          'Beneficiary bank timed out; credit not posted')
                conn.execute('INSERT INTO npci_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (utr,'RRN'+utr[-9:], 'sender@kaveri' if inward else customer['vpa'], customer['vpa'] if inward else payee,
                     amount,at,kind,other if inward else db.OUR_BANK,db.OUR_BANK if inward else other,
                     'SUCCESS','SUCCESS' if conflict else 'FAILED','TCC present but credit ledger missing' if conflict else reason,
                     'TCC'+utr if conflict else None,'PENDING',None,'DEEMED'))
                if inward:
                    sid='SUS'+utr
                    conn.execute('INSERT INTO cbs_inward VALUES (?,?,?,?,?,?,?,?,?,?)',(utr,customer['account_no'],amount,'sender@kaveri','External remitter',other,at,'FAILED','Credit posting rejected by account controls',sid))
                    conn.execute('INSERT INTO cbs_suspense VALUES (?,?,?,?,?,?,?)',(sid,utr,amount,reason,'OPEN',at,None))
                else:
                    conn.execute('INSERT INTO cbs_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?)',(utr,customer['account_no'],'DEBIT',amount,payee,'Annapurna Supermart' if merchant else 'Amit Kulkarni',kind,'PUSH',at,'POSTED',reason))
                    conn.execute('INSERT INTO bene_credits VALUES (?,?,?,?,?,?)',(utr,payee,amount,'NOT_CREDITED',None,None))
                conn.execute('INSERT INTO desk_cases (id,channel,customer_id,utr,message,status,created_at,updated_at,headline) VALUES (?,?,?,?,?,?,?,?,?)',
                    (cid,'RECON',customer['id'],utr,'Unresolved ledger exception. Establish failure location from source records.','QUEUED',at,at,'Failed payment · pending investigation'))
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
