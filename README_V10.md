# Admin portal v10

Deploy the matching dairy-backend v10 change before this portal. Configure the
backend's department-specific sender settings; see its `UPGRADE_V10.md`.

- Catalog → Edit details & image updates each product's name, description,
  unit, price, GST, stock, threshold and photo/GIF. New products accept uploads.
  Uploads are validated on the server. Version conflicts preserve stock authority.
- Logistics has separate Unassigned, Assigned, Cancelled and Completed sections,
  plus Awaiting payment and Failed. Closed orders have no assignment controls.
- The header Unassigned button and Logistics badge show the count across all
  dates/zones. Clicking the button opens the unassigned queue with the date cleared.
- Finance → Driver cash & accounts receipts shows each driver's cumulative COD,
  approved/pending expenses, received cash and outstanding balance. Review
  expenses, then record the actual cash received or confirm a driver handover.
  Only Finance and Super Admin can receive cash; partial receipts are supported.
  Receipts are audited and duplicate/concurrent confirmation is guarded.
- Driver approval queues the approval email and driver profile notification.

Refreshes batch the main data, combine duplicate requests and poll revisions
every two seconds while visible. Existing password/OTP and role controls remain.

Validation: all JavaScript files pass `node --check`; the coordinated backend
passes 91 isolated regressions. A complete live visual check remains pending.
