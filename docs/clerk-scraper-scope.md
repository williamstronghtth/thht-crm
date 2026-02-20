# Volusia County Clerk of Court Scraper — Scope

## Overview
Automated scraper to pull public records from Volusia County Clerk of Court for real estate lead generation.

## Data Sources

### 1. Official Records (app02.clerk.org/or_m/)
**High-value document types for leads:**

| Type | Code | Lead Value |
|------|------|------------|
| Lis Pendens | LP | 🔥 Pre-foreclosure |
| Final Dissolution | FINAL DISSOLUTION | 🔥 Divorce (may need to sell) |
| Probate | PRDL | 🔥 Estate sale potential |
| Lien | LIEN | ⚡ Motivated sellers |
| Bankruptcy | BANKRUPTCY | ⚡ Distressed situations |
| Deed | DEED | 📊 Market activity |

**Data extracted per record:**
- Instrument number
- Filing date
- Case number (links to case details)
- Legal description (property identification)
- Parcel # (when available)
- Direct names (plaintiff/lender)
- Reverse names (defendant/homeowner) ← **THIS IS THE LEAD**
- Book/Page reference

### 2. Case Management System (ccms.clerk.org)
**Case types for leads:**
- Family Law (FMDL/FMCI) — Divorce cases
- Probate (PRDL) — Estate cases
- Circuit Civil (CIDL/CICI) — Foreclosures, liens

**Data extracted per case:**
- Case number
- Case type/status
- Party names
- Filing dates
- Docket entries

## Technical Approach

### Browser Automation Required
Both sites use:
- JavaScript disclaimer popups (must click "Accept")
- ASP.NET postback forms (no REST API)
- Session cookies

**Solution:** Playwright browser automation via OpenClaw's `openclaw` profile.

### Workflow
1. Open site → Accept disclaimer
2. Set search criteria (date range, document type)
3. Parse results table
4. For each record → Open detail view → Extract data
5. De-duplicate by case number
6. Cross-reference with Property Appraiser for address

### Rate Limiting
- 2-3 second delay between requests
- Max 500 records per session
- Run daily at 7am for previous day's filings

## Output Format

```json
{
  "filingDate": "2026-02-02",
  "instrumentNumber": "2026019359",
  "documentType": "LIS PENDENS",
  "caseNumber": "2026 10431 CICI",
  "legalDescription": "LOT 11, BLOCK 6, ORTONA PARK, SECTION THREE",
  "parcelId": null,
  "homeowners": [
    { "name": "DEGREGORIO MELIKE", "type": "individual" },
    { "name": "DEGREGORIO JOSEPH Q", "type": "individual" }
  ],
  "plaintiffs": [
    { "name": "NEWREZ LLC", "type": "corporate" },
    { "name": "SHELLPOINT MORTGAGE SERVICING", "type": "corporate" }
  ],
  "leadType": "foreclosure",
  "priority": "high"
}
```

## Integration with CRM
- Auto-import leads to clientlist.onrender.com
- Tag with lead source: "Clerk Records - Lis Pendens" etc.
- Set follow-up date for next business day
- Notify Jack via Telegram when new leads found

## Estimated Build Time
- Phase 1: Official Records scraper (lis pendens, divorce) — 4-6 hours
- Phase 2: Case Management scraper (probate, civil) — 4-6 hours  
- Phase 3: Property Appraiser cross-reference (address lookup) — 2-3 hours
- Phase 4: CRM integration + notifications — 2-3 hours

**Total: 12-18 hours of dev time**

## Next Steps
1. ✅ Browser automation working (confirmed)
2. ✅ Data structure mapped
3. 🔲 Build Phase 1 scraper
4. 🔲 Test on 1 week of data
5. 🔲 Set up daily cron
