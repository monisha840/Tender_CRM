# Client profile and requirements applied

> The client's official requirements document (`docs/client-requirements.pdf`) was **not available** when this was written.
> Everything below comes from the brief given in chat. When the PDF is added, compare it to this file and
> fix any differences; the PDF wins over `system-flow.md` and over this file.

## Company
S. Prince Hightech Pvt. Ltd. Industrial services contractor for thermal power plants and the steel industry.

- **Directors:** Dr. A. Joseph Stalin (CMD), Antony Bala Prince, Augusti Marys Priyadarshini
- **Offices:** registered office in Mumbai, branch in Chennai, plus a Delhi-region office. A Korba site office exists in the demo data.
- **Customers (organisations):** NTPC, CSPGCL, MSPGCL, DVC, MPPGCL, KPCL, TANGEDCO, IOCL, NALCO
- **Plant sites:** NTPC Korba, CSPGCL Korba West, MSPGCL Chandrapur, MSPGCL Koradi, MPPGCL Sarni, TANGEDCO Mettur, TANGEDCO North Chennai, KPCL Raichur, DVC Mejia, NALCO Angul, IOCL Panipat Refinery
- **Service lines (configurable):** Stone Picking (manpower), Industrial Painting & Coating, Cast Basalt Pipeline, Steel Structure EPC, Civil Works, Scaffolding
- **Units:** man-days, sq m, running metres, MT (cum appears in civil and foundation items)

## Navigation (in this order)
Dashboard, Tenders, Projects, Subcontractors, Employees, GST & Finance, Daily Work, Approvals, Settings.
Notifications is reached from the header bell, not the sidebar.

## Model changes made for the client
| Area | Change |
|---|---|
| Naming | App is "S. Prince Management Tool"; `Client` became `Organisation` |
| Regions | Chhattisgarh, Maharashtra (includes MP), South (TN and Karnataka), Delhi (north and east plants) |
| Tender | Adds organisation, work description, eligibility, opening date and service line |
| Tender stages | New, Under Evaluation, Bid Preparing, Submitted, Won, Lost. GO / NO-GO is decided in Under Evaluation. There are no separate NO-GO, Cancelled, Awarded or Converted stages: a Won tender with a project is a converted one |
| Site | A named plant site; projects point to a site (several projects can share one) |
| Project | Adds work order number, contract type (service or fixed scope), billing cycle, payment terms, service line and plant site |
| Subcontractor assignment | Per project: trade, scope, contract value, dates, progress. Billed, paid, balance and last payment date are derived from bills and payments |
| Employee | Salary and advance on the profile; PF, ESI, deductions, net salary and payment status on the monthly payslip |
| Invoice | Replaces the RA bill. GSTIN, invoice number and date, customer, taxable value, CGST/SGST/IGST, total, payment status, GST filing status, filing reference, filing and payment due dates |

## Assumptions to confirm with the client
- GST rate 18% on all outward invoices; CGST+SGST within the registration state, IGST otherwise (plants in states without a registration are billed from the nearest registered GSTIN).
- PF 12% employee and 12% employer on wages up to the ₹15,000 ceiling; ESI 0.75% / 3.25% when gross is at most ₹21,000; professional tax by state.
- GST filing due on the 11th of the month after the invoice month.
- Purchases, vendors and site stock are kept in the data but have no sidebar item; site requests sit under Daily Work.

## Mock-data coverage (audited by `npm run seed:check`)
| Module | What the seed holds |
|---|---|
| Tenders | 40 tenders: ID, organisation, name, work description, value, EMD, fee, submission and opening dates, eligibility, 10-11 item document checklist with statuses, stage. Six deadlines fall in the next 7 days |
| Projects | 10 projects (8 running, 2 completed): work order no., value, dates, plant site, manager, status, progress, billed to date, received; monthly planned-vs-actual progress snapshots |
| Subcontractors | 12 subcontractors, 16 assignments with trade, value, dates, progress, bills (date, amount, status), paid, balance and last payment date; documents per subcontractor; three work on more than one project; the Rs 50 L Raichur project has Civil, Stone Picking and Painting |
| Employees | 156 employees with code, name, phone, site, designation, department, joining date, salary, advance; 90 days of site attendance; 6 months of payroll with PF, ESI, deductions, net salary and payment status |
| GST & Finance | 51 invoices over 12+ months under four GSTINs, CGST+SGST or IGST by place of supply, filing status and reference, payment status and due dates; monthly revenue and expense series |
| Daily work | About 30 days of reports per running project; site issues |
| Approvals / alerts | 13 pending approvals across five types; 57 notifications of 10+ types |

The 12 months of billing history comes from two completed contracts (MPPGCL Sarni civil repairs, DVC Mejia stone picking) kept alongside the running ones.
Attendance covers site staff only; office staff are on payroll but have no site attendance rows.
The seed is rebuilt on every load and never stored; only a user's edits are persisted (a small overlay in localStorage).

## Dashboard (the client's 13 items, in order)
`getDashboard()` in `src/lib/data/dashboard13.ts`, one selector each: Active Tenders, Upcoming Tender Deadlines, Won / Lost Tenders, Active Projects, Project Value, Subcontractor Work, Subcontractor Pending Payments, Employee Count, Salary Pending, PF Status, GST Due / Filed Status, Customer Receivables, Overall Revenue / Expenses. Pending approvals and missing reports are extra selectors (`getAttentionItems`).
