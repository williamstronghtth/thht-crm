# THHT CRM System Documentation
## Lead Flow & Integration Guide

**Last Updated:** March 6, 2026  
**Author:** Ryan Chen  
**Status:** OpenPhone SMS pending A2P 10DLC approval

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LEAD SOURCES                            │
├─────────────┬─────────────┬─────────────┬─────────────┬────────┤
│ Skip Trace  │ Cold Call   │ Letter      │ Website     │ Other  │
│ CSV Import  │ Lists       │ Response    │ Form        │        │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴───┬────┘
       │             │             │             │          │
       └─────────────┴─────────────┴─────────────┴──────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │       THHT CRM           │
                    │   clientlist.onrender.com │
                    ├──────────────────────────┤
                    │ • 647 total leads        │
                    │ • Pipeline tracking      │
                    │ • Activity logging       │
                    │ • Follow-up reminders    │
                    │ • Property alerts        │
                    └────────────┬─────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
            ▼                    ▼                    ▼
   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
   │   OPENPHONE    │   │    JACK/QUO    │   │     CHRIS      │
   │   (Calls/SMS)  │   │   (Cadence)    │   │   (Dialer)     │
   │                │   │                │   │                │
   │ • Call logging │   │ • Text         │   │ • Power dialer │
   │ • Click-to-call│   │ • Email        │   │ • 300 calls/day│
   │ • SMS (pending)│   │ • Nurture seq  │   │ • Dispositions │
   └────────────────┘   └────────────────┘   └────────────────┘
```

---

## 🔄 Lead Flow: How Prospects Enter the CRM

### Method 1: CSV Import (Primary)
**Used for:** Skip trace results, purchased lists, bulk imports

```bash
node scripts/import-csv.js leads.csv
```

**CSV Format:**
```csv
firstName,lastName,phone,email,address,leadSource,leadType
John,Smith,386-555-1234,john@email.com,123 Main St,Cold Calling,warm
```

**What happens:**
1. Script parses CSV
2. Deduplicates by phone number
3. Creates client records in CRM
4. Sets initial stage to `lead`
5. Logs "Created via CSV import" in activity

### Method 2: Manual Entry
**Used for:** Individual leads, referrals, hot prospects

1. Click "Add Client" in CRM
2. Fill form fields
3. Set lead type and source
4. Save

### Method 3: API (Future)
**Endpoint:** `POST /api/clients`

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "386-555-1234",
  "email": "john@email.com",
  "leadSource": "Website Home Evaluation",
  "leadType": "warm"
}
```

---

## 📱 OpenPhone Integration

### Current Status
| Feature | Status | Notes |
|---------|--------|-------|
| Call History | ✅ Live | Syncs to CRM |
| Click-to-Call | ✅ Live | Opens OpenPhone app |
| Call Logging | ✅ Live | Manual + webhook |
| SMS Outbound | ⏳ Pending | A2P 10DLC review |
| SMS Inbound | ⏳ Pending | A2P 10DLC review |

### API Configuration
```
OPENPHONE_API_KEY=eBT7xb2iz28sv69Ep8TQhdEQ4iy0yqUP
OPENPHONE_NUMBER=+13862733460
```

### How Call Logging Works

**Automatic (Webhook):**
1. Call completes on OpenPhone
2. Webhook fires to `/api/webhooks/openphone`
3. CRM matches phone number to client
4. Activity logged: "Call - Outbound - 3:45"

**Manual:**
1. Click "Log Activity" on client
2. Select "Call" type
3. Add notes/outcome
4. Save

### Click-to-Call Flow
1. User clicks phone number in CRM
2. `tel:` link opens OpenPhone app
3. Call initiated
4. After call, webhook logs activity

---

## 📋 Lead Types & Stages

### Lead Types
| Type | Description | Typical Source |
|------|-------------|----------------|
| `warm` | Engaged, showing interest | Website, referral |
| `cold` | New, not contacted | Skip trace, purchased list |
| `divorce` | Property from divorce | Court records |
| `probate` | Inherited property | Court records |
| `pre-foreclosure` | Financial distress | Lis pendens |
| `expired` | Listing expired | MLS data |
| `fsbo` | For Sale By Owner | Zillow, signs |
| `investor` | Investment property | Networking |
| `referral` | Past client referral | Sphere |
| `sphere` | Personal network | SOI |

### Pipeline Stages
```
lead → active → contract → closed → past
  │       │         │         │       │
  │       │         │         │       └── Transaction complete
  │       │         │         └── Deal closed
  │       │         └── Under contract
  │       └── Actively working
  └── New prospect
```

---

## 👤 Jack's Cadence (Quo) — How It Will Work

### Cadence Touchpoints
```
Day 0:  Initial contact attempt (text or email)
Day 2:  Follow-up text
Day 5:  Email with value add
Day 7:  CALL TOUCH ← Chris dials here
Day 10: Text check-in
Day 14: Email (market update)
Day 21: CALL TOUCH ← Chris dials here
Day 30: Final follow-up
```

### What Triggers Updates

| Trigger | Action | CRM Update |
|---------|--------|------------|
| Jack sends text | OpenPhone webhook | Activity: "SMS - Outbound" |
| Prospect replies | OpenPhone webhook | Activity: "SMS - Inbound", notify |
| Email sent | Manual log or Mailchimp | Activity: "Email sent" |
| Call completed | OpenPhone webhook | Activity: "Call - X min" |
| Disposition set | Chris in dialer | Stage change, next action |

### SMS Sync (Once A2P Approved)

**Outbound:**
1. Jack composes text in OpenPhone
2. Sends to prospect
3. Webhook fires: `message.sent`
4. CRM logs activity

**Inbound:**
1. Prospect replies
2. OpenPhone receives
3. Webhook fires: `message.received`
4. CRM logs activity + shows notification

---

## 🎯 Dialer Integration (Future — Aircall)

### Planned Flow
```
CRM Campaign → Aircall Queue → Chris Dials → Disposition → CRM Update
```

### Disposition Codes (Proposed)
| Code | Meaning | CRM Action |
|------|---------|------------|
| `connected` | Spoke with prospect | Log call, set follow-up |
| `voicemail` | Left VM | Log attempt, schedule callback |
| `no-answer` | No answer, no VM | Log attempt |
| `callback` | Requested callback | Set follow-up date |
| `not-interested` | DNC | Update stage, flag |
| `wrong-number` | Bad data | Flag for removal |
| `appointment` | Booked appointment | Move to `active` |

---

## 🔌 API Endpoints

### Clients
```
GET    /api/clients              # List all (with filters)
GET    /api/clients/:id          # Get single client
POST   /api/clients              # Create client
PUT    /api/clients/:id          # Update client
DELETE /api/clients/:id          # Delete client
POST   /api/clients/:id/activity # Log activity
```

### OpenPhone Webhooks
```
POST   /api/webhooks/openphone   # Receive call/SMS events
```

### Call History
```
GET    /api/calls                # List recent calls (from OpenPhone)
GET    /api/calls/:id            # Get call details + transcript
```

---

## ✅ End-to-End Test Checklist

Once A2P clears, run through this:

### 1. Create Test Lead
- [ ] Add "Test Prospect" via CRM
- [ ] Phone: Use a test number you control
- [ ] Verify appears in client list

### 2. Test Outbound SMS
- [ ] Jack sends text from OpenPhone to test number
- [ ] Verify webhook fires
- [ ] Verify CRM logs "SMS - Outbound"

### 3. Test Inbound SMS
- [ ] Reply from test number
- [ ] Verify webhook fires
- [ ] Verify CRM logs "SMS - Inbound"
- [ ] Verify notification appears

### 4. Test Call Flow
- [ ] Click-to-call from CRM
- [ ] Make short call
- [ ] Verify webhook logs call
- [ ] Verify duration captured

### 5. Test Disposition Flow
- [ ] Log call outcome manually
- [ ] Verify activity shows in timeline
- [ ] Set follow-up date
- [ ] Verify reminder appears on dashboard

---

## 🚨 Known Limitations

1. **Ephemeral Storage:** Render's filesystem resets on deploy. Need Supabase for persistence.
2. **A2P Pending:** SMS features blocked until campaign approved (1-3 weeks typical).
3. **OpenPhone Read-Only:** Cannot initiate calls programmatically, only log them.
4. **No MLS Feed:** Property alerts need manual data or RPR scraping.

---

## 📞 Support Contacts

- **Ryan Chen** (CRM/Integration): sessions_send to `agent:ryan-chen:main`
- **Jack Sullivan** (Cadence/Outreach): sessions_send to `agent:jack-sullivan:main`
- **Chris Hoover** (Owner): Telegram 8560812913

---

*Document maintained by Ryan Chen. Last updated March 6, 2026.*
