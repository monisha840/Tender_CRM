import { percentOf } from "@/lib/money";
import { addDays, DEMO_TODAY } from "@/lib/dates";
import type { ApprovalStatus, Id, IsoDate, Money, TechnicalResult } from "@/types";
import { CLIENT_SHORT, employeeIdOfUser, userId } from "./org";
import { docTypeId, portalId, stageId, tenderTypeId, type StageKey } from "./masters";
import { at, dayOffset, financialYear, lakh, meta, pad, rupees, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";

interface TenderSpec {
  key: string;
  title: string;
  client: string;
  region: RegionKeyName;
  loc: string;
  type: number;
  portal: number;
  /** Government estimate, in lakh. */
  est: number;
  stage: StageKey;
  /** Submission deadline, in days from the demo "today". */
  dl: number;
  /** Our bid vs estimate, in percent (negative = below). */
  pct?: number;
  gst?: "mh2";
  /** LOST only: technical bid rejected rather than outbid. */
  techRejected?: boolean;
  /** NO_GO / CANCELLED reason text. */
  reason?: string;
}

const SPECS: TenderSpec[] = [
  // ---- Korba ----
  { key: "korba_road", title: "Construction of Road from Korba–Katghora Road to Dipka Colliery (Package 2)", client: "cl_cg_pwd_korba", region: "korba", loc: "Dipka, Korba, Chhattisgarh", type: 0, portal: 0, est: 240, stage: "CONVERTED_TO_PROJECT", dl: -190, pct: -3.75 },
  { key: "korba_hall", title: "Construction of Community Hall & Boundary Wall, Ward 18, Korba", client: "cl_korba_mc", region: "korba", loc: "Ward 18, Korba", type: 1, portal: 0, est: 118, stage: "CONVERTED_TO_PROJECT", dl: -240, pct: -5.1 },
  { key: "korba_pipe", title: "Water Supply Pipeline Extension, Dipka–Kusmunda", client: "cl_cg_phe", region: "korba", loc: "Dipka–Kusmunda, Korba", type: 2, portal: 0, est: 410, stage: "CONVERTED_TO_PROJECT", dl: -280, pct: -6.1 },
  { key: "korba_bridge", title: "Minor Bridge over Ahiran Nala, Pali Road", client: "cl_cg_pwd_korba", region: "korba", loc: "Pali, Korba", type: 5, portal: 0, est: 520, stage: "FINANCIAL_EVALUATION", dl: -15, pct: -2.8 },
  { key: "korba_substation", title: "33/11 kV Substation Building, Katghora", client: "cl_cspdcl", region: "korba", loc: "Katghora, Korba", type: 4, portal: 0, est: 185, stage: "SUBMITTED", dl: -3, pct: -4.0 },
  { key: "korba_school", title: "Additional Classrooms, Govt. HSS Balco Nagar", client: "cl_cg_pwd_korba", region: "korba", loc: "Balco Nagar, Korba", type: 1, portal: 0, est: 96, stage: "LOST", dl: -120, pct: -1.2 },
  { key: "korba_drain", title: "Storm Water Drain, Transport Nagar", client: "cl_korba_mc", region: "korba", loc: "Transport Nagar, Korba", type: 3, portal: 0, est: 142, stage: "LOST", dl: -200, pct: 0.5, techRejected: true },
  { key: "korba_road2", title: "Strengthening of Road Dipka–Gevra (8 km)", client: "cl_cg_pwd_korba", region: "korba", loc: "Dipka–Gevra, Korba", type: 0, portal: 0, est: 365, stage: "PREPARATION", dl: 6 },
  { key: "korba_hostel", title: "Boys Hostel Building, Tribal Welfare Dept., Pali", client: "cl_cg_pwd", region: "korba", loc: "Pali, Korba", type: 1, portal: 0, est: 255, stage: "GO_NO_GO_PENDING", dl: 14 },
  { key: "korba_resurface", title: "Resurfacing of Katghora–Kartala Road", client: "cl_cg_pwd_korba", region: "korba", loc: "Katghora–Kartala", type: 0, portal: 0, est: 205, stage: "EMD_ARRANGED", dl: 1 },
  { key: "korba_nogo", title: "Desilting of Hasdeo Canal, Reach 3", client: "cl_cg_pwd", region: "korba", loc: "Hasdeo canal, Korba", type: 3, portal: 0, est: 640, stage: "NO_GO", dl: -30, reason: "Requires dredging machinery we do not have in the region; margin too thin for sub-leasing." },
  { key: "korba_wall", title: "Retaining Wall at Kosabadi Colony", client: "cl_secl", region: "korba", loc: "Kosabadi, Korba", type: 5, portal: 3, est: 78, stage: "IDENTIFIED", dl: 25 },
  { key: "korba_park", title: "Park Development, Rani Durgavati Ward", client: "cl_korba_mc", region: "korba", loc: "Korba", type: 6, portal: 0, est: 88, stage: "CANCELLED", dl: -60, pct: -2.0, reason: "Cancelled by department after revised sanction." },
  { key: "korba_culvert", title: "Culvert Construction, Rajgamar Road", client: "cl_cg_pwd_korba", region: "korba", loc: "Rajgamar, Korba", type: 5, portal: 0, est: 134, stage: "LOST", dl: -330, pct: -2.2 },
  // ---- Delhi ----
  { key: "del_drain", title: "Stormwater Drain Remodelling, Rohini Sector 24", client: "cl_djb", region: "delhi", loc: "Rohini Sector 24, Delhi", type: 3, portal: 1, est: 480, stage: "CONVERTED_TO_PROJECT", dl: -210, pct: -4.17 },
  { key: "del_road", title: "Resurfacing of Roads, Ward 112 South Zone", client: "cl_mcd", region: "delhi", loc: "South Zone, Delhi", type: 0, portal: 1, est: 310, stage: "CONVERTED_TO_PROJECT", dl: -150, pct: -4.84 },
  { key: "del_sewer", title: "Sewer Line Rehabilitation, Dwarka Sector 11", client: "cl_djb", region: "delhi", loc: "Dwarka Sector 11, Delhi", type: 2, portal: 1, est: 590, stage: "AGREEMENT_SIGNED", dl: -70, pct: -3.4 },
  { key: "del_park", title: "Landscaping & Jogging Track, Dilshad Garden", client: "cl_dda", region: "delhi", loc: "Dilshad Garden, Delhi", type: 6, portal: 1, est: 165, stage: "AWARDED", dl: -45, pct: -2.9 },
  { key: "del_fob", title: "Foot Over Bridge, Pitampura", client: "cl_del_pwd", region: "delhi", loc: "Pitampura, Delhi", type: 5, portal: 1, est: 720, stage: "TECHNICAL_EVALUATION", dl: -8, pct: -1.8 },
  { key: "del_centre", title: "Community Centre, Sultanpuri", client: "cl_mcd", region: "delhi", loc: "Sultanpuri, Delhi", type: 1, portal: 1, est: 275, stage: "SUBMITTED", dl: -2, pct: -3.3 },
  { key: "del_slum", title: "Internal Roads, Jahangirpuri Resettlement Colony", client: "cl_dda", region: "delhi", loc: "Jahangirpuri, Delhi", type: 0, portal: 1, est: 350, stage: "LOST", dl: -90, pct: -2.0 },
  { key: "del_najafgarh", title: "Drain Covering Works, Najafgarh Road", client: "cl_del_pwd", region: "delhi", loc: "Najafgarh Road, Delhi", type: 3, portal: 1, est: 220, stage: "LOST", dl: -260, pct: 0.2, techRejected: true },
  { key: "del_tank", title: "Water Tank & Pump House, Narela", client: "cl_djb", region: "delhi", loc: "Narela, Delhi", type: 2, portal: 1, est: 305, stage: "PREPARATION", dl: 9 },
  { key: "del_widen", title: "Road Widening, Mundka–Bawana", client: "cl_del_pwd", region: "delhi", loc: "Mundka–Bawana, Delhi", type: 0, portal: 1, est: 880, stage: "GO_NO_GO_PENDING", dl: 10 },
  { key: "del_toilets", title: "Public Toilet Complexes (12 nos.), North Zone", client: "cl_mcd", region: "delhi", loc: "North Zone, Delhi", type: 6, portal: 1, est: 118, stage: "REGISTERED", dl: 21 },
  // ---- Maharashtra ----
  { key: "mh_culvert", title: "Culvert & Approach Road, Nagpur–Katol", client: "cl_mh_pwd", region: "mh", loc: "Nagpur–Katol Road", type: 5, portal: 2, est: 560, stage: "CONVERTED_TO_PROJECT", dl: -230, pct: -3.57 },
  { key: "mh_school", title: "Municipal School Building Block B, Pune", client: "cl_pmc", region: "mh", loc: "Hadapsar, Pune", type: 1, portal: 2, est: 720, stage: "CONVERTED_TO_PROJECT", dl: -175, pct: -4.86, gst: "mh2" },
  { key: "mh_underpass", title: "Underpass Drainage Works, Wardha Road, Nagpur", client: "cl_nmc", region: "mh", loc: "Wardha Road, Nagpur", type: 3, portal: 2, est: 330, stage: "WON", dl: -25, pct: -3.0 },
  { key: "mh_bypass", title: "Bypass Road Stage 1, Chandrapur", client: "cl_msrdc", region: "mh", loc: "Chandrapur", type: 0, portal: 2, est: 1450, stage: "FINANCIAL_EVALUATION", dl: -16, pct: -2.5 },
  { key: "mh_zpwall", title: "Compound Wall & Gate, Zilla Parishad School Cluster", client: "cl_zp_nagpur", region: "mh", loc: "Kamptee, Nagpur", type: 1, portal: 2, est: 92, stage: "EMD_ARRANGED", dl: 4 },
  { key: "mh_wtp", title: "Water Treatment Plant Civil Works, Kamptee", client: "cl_nmc", region: "mh", loc: "Kamptee, Nagpur", type: 2, portal: 2, est: 640, stage: "PREPARATION", dl: 7 },
  { key: "mh_wagholi", title: "Road Improvement Wagholi–Lohegaon, Pune", client: "cl_pmc", region: "mh", loc: "Wagholi, Pune", type: 0, portal: 2, est: 395, stage: "GO_NO_GO_PENDING", dl: 12, gst: "mh2" },
  { key: "mh_nogo", title: "Metro Station Interior Fit-out, Pune", client: "cl_msrdc", region: "mh", loc: "Pune", type: 1, portal: 3, est: 1800, stage: "NO_GO", dl: -45, reason: "Experience criteria (metro fit-out) not met; JV partner not available." },
  { key: "mh_hingna", title: "RCC Road, Hingna MIDC", client: "cl_msrdc", region: "mh", loc: "Hingna MIDC, Nagpur", type: 0, portal: 2, est: 410, stage: "LOST", dl: -140, pct: -1.5 },
  { key: "mh_baner", title: "Footpath & Cycle Track, Baner", client: "cl_pmc", region: "mh", loc: "Baner, Pune", type: 6, portal: 2, est: 175, stage: "LOST", dl: -310, pct: -0.8, gst: "mh2" },
  { key: "mh_ghat", title: "Retaining Wall, Ghat Section Kalmeshwar", client: "cl_mh_pwd", region: "mh", loc: "Kalmeshwar, Nagpur", type: 5, portal: 2, est: 260, stage: "IDENTIFIED", dl: 28 },
];

const RH: Record<RegionKeyName, string> = { korba: "rh_korba", delhi: "rh_delhi", mh: "rh_mh" };
const REGION_GST: Record<RegionKeyName, string> = { korba: "gst_cg", delhi: "gst_dl", mh: "gst_mh1" };
const BANKS = ["State Bank of India", "Bank of Baroda", "HDFC Bank", "Punjab National Bank", "Canara Bank"];
const COMPETITORS = [
  "Shree Balaji Infra", "Mahalaxmi Constructions", "Tirupati Buildcon", "Raj Kumar & Sons",
  "Bhawani Engineers", "NK Infra Projects", "Satyam Contractors", "Ambika Civil Works",
];

/** Ordered pipeline used to derive each tender's stage history. */
const PIPELINE: StageKey[] = [
  "IDENTIFIED", "REGISTERED", "GO_NO_GO_PENDING", "PREPARATION", "EMD_ARRANGED", "SUBMITTED",
  "TECHNICAL_EVALUATION", "FINANCIAL_EVALUATION",
];
/** Day offsets from the submission deadline at which each stage was entered. */
const STAGE_AT: Record<string, number> = {
  IDENTIFIED: -21, REGISTERED: -19, GO_NO_GO_PENDING: -17, PREPARATION: -15, NO_GO: -15, EMD_ARRANGED: -5,
  SUBMITTED: -1, TECHNICAL_EVALUATION: 2, FINANCIAL_EVALUATION: 8, WON: 16, LOST: 16, CANCELLED: 9,
  AWARDED: 28, AGREEMENT_SIGNED: 43, CONVERTED_TO_PROJECT: 50,
};

function pathTo(spec: TenderSpec): StageKey[] {
  const { stage } = spec;
  const upTo = (last: StageKey) => PIPELINE.slice(0, PIPELINE.indexOf(last) + 1);
  switch (stage) {
    case "NO_GO": return [...upTo("GO_NO_GO_PENDING"), "NO_GO"];
    case "LOST": return [...upTo(spec.techRejected ? "TECHNICAL_EVALUATION" : "FINANCIAL_EVALUATION"), "LOST"];
    case "CANCELLED": return [...upTo("SUBMITTED"), "CANCELLED"];
    case "WON": return [...upTo("FINANCIAL_EVALUATION"), "WON"];
    case "AWARDED": return [...upTo("FINANCIAL_EVALUATION"), "WON", "AWARDED"];
    case "AGREEMENT_SIGNED": return [...upTo("FINANCIAL_EVALUATION"), "WON", "AWARDED", "AGREEMENT_SIGNED"];
    case "CONVERTED_TO_PROJECT": return [...upTo("FINANCIAL_EVALUATION"), "WON", "AWARDED", "AGREEMENT_SIGNED", "CONVERTED_TO_PROJECT"];
    default: return upTo(stage);
  }
}

export interface ConvertedTender {
  key: string;
  tenderId: Id;
  title: string;
  clientId: Id;
  regionKey: RegionKeyName;
  regionId: Id;
  gstId: Id;
  ownerId: Id;
  awardedAmount: Money;
  loaDate: IsoDate;
  agreementDate: IsoDate;
  convertedDate: IsoDate;
  startDate: IsoDate;
  completionDays: number;
}

export function seedTenders(ctx: SeedCtx): ConvertedTender[] {
  const { db, rng } = ctx;
  const converted: ConvertedTender[] = [];
  const today = DEMO_TODAY;
  const clamp = (offset: number) => dayOffset(Math.min(offset, 0));

  SPECS.forEach((s, idx) => {
    const id = `tnd_${s.key}`;
    const path = pathTo(s);
    const has = (k: StageKey) => path.includes(k);
    const ownerKey = s.region === "korba" ? "tender1" : s.region === "delhi" ? "tender2" : idx % 2 ? "tender1" : "tender2";
    const gstId = s.gst === "mh2" ? "gst_mh2" : REGION_GST[s.region];
    const estimate = lakh(s.est);
    const emdAmount = percentOf(estimate, 2);
    const tenderFee = rupees(s.est >= 500 ? 5900 : s.est >= 200 ? 2950 : 1180);
    const deadline = dayOffset(s.dl);
    const fy = financialYear(addDays(deadline, -21));
    const isWonFamily = ["WON", "AWARDED", "AGREEMENT_SIGNED", "CONVERTED_TO_PROJECT"].includes(s.stage);
    const resultId = isWonFamily ? "res_won" : s.stage === "LOST" ? "res_lost" : s.stage === "CANCELLED" ? "res_cancelled" : null;

    db.tenders.push({
      ...meta(id, at(clamp(s.dl - 21))),
      tenderNo: `${CLIENT_SHORT[s.client]}/NIT/${fy}/${pad(100 + idx * 3)}`,
      title: s.title,
      clientId: s.client,
      regionId: RegionKey[s.region],
      location: s.loc,
      tenderTypeId: tenderTypeId(s.type),
      portalId: portalId(s.portal),
      sourceUrl: null,
      estimatedValue: estimate,
      emdAmount,
      tenderFee,
      publishedOn: addDays(deadline, -21),
      preBidAt: has("REGISTERED") ? at(addDays(deadline, -14), "11:00") : null,
      submissionDeadlineAt: at(deadline, "15:00"),
      technicalOpeningAt: at(addDays(deadline, 2), "11:00"),
      financialOpeningAt: at(addDays(deadline, 12), "11:00"),
      currentStageId: stageId(s.stage),
      resultId,
      ownerId: userId(ownerKey),
      gstRegistrationId: gstId,
    });

    // ---- Stage history (drives the timeline) ----
    path.forEach((stage, i) => {
      db.tenderStageHistory.push({
        ...meta(`tsh_${s.key}_${i + 1}`),
        tenderId: id,
        fromStageId: i === 0 ? null : stageId(path[i - 1]),
        toStageId: stageId(stage),
        changedById: userId(stage === "PREPARATION" || stage === "NO_GO" ? RH[s.region] : ownerKey),
        changedAt: at(clamp(s.dl + STAGE_AT[stage]), "10:30"),
        reason: stage === "NO_GO" || stage === "CANCELLED" ? (s.reason ?? null) : null,
      });
    });

    // ---- GO / NO-GO decision + approval request ----
    const approverKey = s.est > 500 ? "director" : RH[s.region];
    const requestId = `apr_gng_${s.key}`;
    const gngDate = clamp(s.dl + STAGE_AT.GO_NO_GO_PENDING);
    if (has("GO_NO_GO_PENDING")) {
      const decided = has("PREPARATION") || has("NO_GO");
      const status: ApprovalStatus = decided ? "APPROVED" : "PENDING";
      const decisionDate = clamp(s.dl + STAGE_AT.PREPARATION);
      db.approvalRequests.push({
        ...meta(requestId),
        entityType: "TENDER_GO_NO_GO",
        entityId: id,
        amount: estimate,
        regionId: RegionKey[s.region],
        projectId: null,
        title: `GO / NO-GO: ${s.title}`,
        requestedById: userId(ownerKey),
        status,
        currentSequence: 1,
        submittedAt: at(gngDate, "12:00"),
        completedAt: decided ? at(decisionDate, "16:00") : null,
      });
      db.approvalSteps.push({
        ...meta(`${requestId}_s1`),
        requestId,
        sequence: 1,
        assignedUserId: userId(approverKey),
        status,
        dueAt: decided ? null : at(addDays(today, 2), "18:00"),
      });
      if (decided) {
        db.approvalActions.push({
          ...meta(`${requestId}_a1`),
          stepId: `${requestId}_s1`,
          actorId: userId(approverKey),
          action: "APPROVE",
          comment: has("NO_GO") ? "Agreed: do not participate." : "Approved to participate.",
          at: at(decisionDate, "16:00"),
        });
        db.goNoGoDecisions.push({
          ...meta(`gng_${s.key}`),
          tenderId: id,
          decision: has("NO_GO") ? "NO_GO" : "GO",
          decidedById: userId(approverKey),
          decidedAt: at(decisionDate, "16:00"),
          reason: has("NO_GO") ? (s.reason ?? "Not feasible.") : "Region has capacity; eligibility criteria met.",
          approvalRequestId: requestId,
        });
      }
    }

    // ---- Document checklist ----
    if (has("PREPARATION")) {
      const items: [string, number, boolean][] = [
        ["Company registration", 0, true], ["PAN card", 1, true], ["GST registration certificate", 2, true],
        ["EPF / ESI registration", 3, true], ["Solvency certificate", 4, true], ["Turnover certificate (CA)", 5, true],
        ["Experience certificates", 6, true], ["Affidavit / declaration", 7, true], ["Power of attorney", 8, false],
      ];
      items.forEach(([name, dt, mandatory], i) => {
        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" | "NA" = "READY";
        if (s.stage === "PREPARATION") status = i < 4 ? "READY" : i === 4 || i === 5 ? "IN_PROGRESS" : "NOT_STARTED";
        if (s.stage === "PREPARATION" && s.key === "del_tank") status = i < 2 ? "READY" : "IN_PROGRESS";
        if (s.stage === "EMD_ARRANGED" && name === "Experience certificates" && s.key === "korba_resurface") status = "IN_PROGRESS";
        if (!mandatory && s.stage !== "PREPARATION") status = "NA";
        db.tenderDocumentItems.push({
          ...meta(`tdi_${s.key}_${i + 1}`),
          tenderId: id,
          name,
          documentTypeId: docTypeId(dt),
          isMandatory: mandatory,
          status,
          assigneeId: employeeIdOfUser(i % 2 ? "legal" : ownerKey),
          dueDate: addDays(deadline, -3),
        });
      });
    }

    // ---- EMD ----
    const emdId = `si_emd_${s.key}`;
    if (has("EMD_ARRANGED")) {
      const mode = s.key === "korba_road" ? "DD" : rng.pick(["DD", "BG", "ONLINE", "FDR"] as const);
      const refundPending = s.stage === "LOST" && s.dl > -200;
      const status =
        s.stage === "EMD_ARRANGED" ? "ARRANGED"
        : s.stage === "CANCELLED" || (s.stage === "LOST" && !refundPending) ? "REFUNDED"
        : s.stage === "AGREEMENT_SIGNED" || s.stage === "CONVERTED_TO_PROJECT" ? "ADJUSTED"
        : "SUBMITTED";
      const issue = addDays(deadline, -6);
      db.securityInstruments.push({
        ...meta(emdId),
        type: "EMD",
        tenderId: id,
        projectId: null,
        mode,
        amount: emdAmount,
        instrumentNo: `${mode}-${rng.int(100000, 999999)}`,
        bank: s.key === "korba_road" ? "State Bank of India, Korba Main" : rng.pick(BANKS),
        issueDate: issue,
        expiryDate: addDays(deadline, 180),
        status,
      });
      db.securityInstrumentEvents.push({
        ...meta(`sie_${s.key}_1`), securityInstrumentId: emdId, type: "ISSUED", amount: emdAmount, date: issue, reference: null,
      });
      if (refundPending) {
        db.securityInstrumentEvents.push({
          ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "REFUND_REQUESTED", amount: emdAmount,
          date: addDays(deadline, 30), reference: "Letter to department",
        });
      } else if (status === "REFUNDED") {
        db.securityInstrumentEvents.push({
          ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "REFUNDED", amount: emdAmount,
          date: addDays(deadline, 45), reference: "Refund credited",
        });
      } else if (status === "ADJUSTED") {
        db.securityInstrumentEvents.push({
          ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "ADJUSTED", amount: emdAmount,
          date: addDays(deadline, 43), reference: "Adjusted into PBG",
        });
      }
    }

    // ---- Bid, competitors, clarifications ----
    let quoted: Money | null = null;
    if (has("SUBMITTED") && s.pct !== undefined) {
      quoted = rupees(Math.round(s.est * 100000 * (1 + s.pct / 100)));
      const wonFamily = isWonFamily;
      const tech: TechnicalResult =
        s.stage === "SUBMITTED" || s.stage === "TECHNICAL_EVALUATION" || s.stage === "CANCELLED" ? "PENDING"
        : s.techRejected ? "REJECTED" : "QUALIFIED";
      const ourRank = wonFamily ? 1 : s.stage === "LOST" ? (s.techRejected ? null : rng.int(2, 3)) : s.key === "korba_bridge" ? 1 : s.key === "mh_bypass" ? 2 : null;
      db.bids.push({
        ...meta(`bid_${s.key}`),
        tenderId: id,
        quotedAmount: quoted,
        percentVsEstimate: s.pct.toFixed(4),
        submittedAt: at(addDays(deadline, -1), "14:20"),
        technicalResult: tech,
        financialRank: ourRank,
        isL1: ourRank === 1,
        isFinal: true,
      });
      if (has("FINANCIAL_EVALUATION") && tech === "QUALIFIED") {
        const q = s.est * 100000 * (1 + s.pct / 100);
        const rivals = rng.int(3, 4);
        for (let i = 0; i < rivals; i++) {
          const rank = i + 1 >= (ourRank ?? 99) ? i + 2 : i + 1;
          const above = ourRank === 1 || rank > (ourRank ?? 99);
          const amount = above ? q * (1 + rng.float(0.006, 0.04) * (i + 1)) : q * (1 - rng.float(0.008, 0.03));
          const isL1 = ourRank !== 1 && rank === 1;
          db.competitorBids.push({
            ...meta(`cb_${s.key}_${i + 1}`),
            tenderId: id,
            competitorName: COMPETITORS[(idx + i * 3) % COMPETITORS.length],
            amount: rupees(Math.round(amount)),
            rank,
            isL1,
          });
        }
      }
    }
    if (s.key === "korba_road") {
      db.bidClarifications.push({
        ...meta("bc_korba_road_1"), bidId: "bid_korba_road",
        request: "Submit solvency certificate issued within the last 6 months.",
        requestedOn: addDays(deadline, 3), dueDate: addDays(deadline, 6),
        response: "Revised solvency certificate dated within validity uploaded.", respondedOn: addDays(deadline, 5),
      });
    }
    if (s.key === "del_fob") {
      db.bidClarifications.push({
        ...meta("bc_del_fob_1"), bidId: "bid_del_fob",
        request: "Clarify availability of structural design consultant and past FOB experience.",
        requestedOn: addDays(today, -3), dueDate: addDays(today, 1), response: null, respondedOn: null,
      });
    }

    // ---- Award, conditions, PBG ----
    if (has("AWARDED") && quoted) {
      const short = CLIENT_SHORT[s.client];
      const loaDate = addDays(deadline, STAGE_AT.AWARDED);
      const agreementDate = addDays(deadline, STAGE_AT.AGREEMENT_SIGNED);
      const hasAgreement = has("AGREEMENT_SIGNED");
      const isConverted = s.stage === "CONVERTED_TO_PROJECT";
      const completionDays = s.key === "korba_road" ? 365 : rng.pick([270, 300, 365, 420, 540]);
      const convertedDate = addDays(deadline, STAGE_AT.CONVERTED_TO_PROJECT);
      const startDate = addDays(convertedDate, 7);
      const awardId = `award_${s.key}`;
      db.tenderAwards.push({
        ...meta(awardId),
        tenderId: id,
        loaNo: `${short}/LoA/${fy}/${pad(20 + idx)}`,
        loaDate,
        awardedAmount: quoted,
        agreementNo: hasAgreement ? `${short}/AGR/${fy}/${pad(10 + idx)}` : null,
        agreementDate: hasAgreement ? agreementDate : null,
        completionPeriodDays: completionDays,
        startDate: isConverted ? startDate : null,
        conditionsNote: "PBG at 5% of contract value within 15 days of LoA.",
      });
      const pbgDone = hasAgreement;
      db.awardConditions.push(
        { ...meta(`ac_${s.key}_1`), awardId, description: "Performance bank guarantee (5%) submitted", isMandatory: true, status: pbgDone ? "MET" : "PENDING", dueDate: addDays(loaDate, 15) },
        { ...meta(`ac_${s.key}_2`), awardId, description: "Agreement signed on stamp paper", isMandatory: true, status: hasAgreement ? "MET" : "PENDING", dueDate: addDays(loaDate, 30) },
        { ...meta(`ac_${s.key}_3`), awardId, description: "Contractor's all-risk insurance policy", isMandatory: false, status: hasAgreement ? "MET" : "PENDING", dueDate: addDays(loaDate, 30) },
      );
      const pbgAmount = percentOf(quoted, 5);
      const pbgExpiry =
        s.key === "korba_hall" ? addDays(today, 25) : addDays(startDate, completionDays + 90);
      db.securityInstruments.push({
        ...meta(`si_pbg_${s.key}`),
        type: "PBG",
        tenderId: id,
        projectId: isConverted ? `prj_${s.key}` : null,
        mode: "BG",
        amount: pbgAmount,
        instrumentNo: `BG-${rng.int(100000, 999999)}`,
        bank: rng.pick(BANKS),
        issueDate: pbgDone ? addDays(loaDate, 10) : null,
        expiryDate: pbgExpiry,
        status: pbgDone ? "SUBMITTED" : "ARRANGED",
      });
      if (isConverted) {
        converted.push({
          key: s.key, tenderId: id, title: s.title, clientId: s.client, regionKey: s.region, regionId: RegionKey[s.region],
          gstId, ownerId: userId(ownerKey), awardedAmount: quoted, loaDate, agreementDate, convertedDate, startDate, completionDays,
        });
      }
    }

    // ---- Supporting documents (flagship tender) ----
    if (s.key === "korba_road") {
      [
        ["Tender notice (NIT).pdf", 14, 842_113],
        ["Bid acknowledgement.pdf", 13, 120_552],
        ["Letter of Acceptance.pdf", 11, 210_330],
        ["Agreement.pdf", 12, 1_532_880],
      ].forEach(([fileName, dt, size], i) => {
        db.documents.push({
          ...meta(`doc_korba_road_${i + 1}`),
          storageKey: `tenders/korba_road/${i + 1}`,
          fileName: String(fileName),
          mime: "application/pdf",
          size: Number(size),
          documentTypeId: docTypeId(Number(dt)),
          version: 1,
          uploadedById: userId("tender1"),
        });
        db.documentLinks.push(
          { ...meta(`dl_korba_road_t${i + 1}`), documentId: `doc_korba_road_${i + 1}`, entityType: "TENDER", entityId: id },
          { ...meta(`dl_korba_road_p${i + 1}`), documentId: `doc_korba_road_${i + 1}`, entityType: "PROJECT", entityId: "prj_korba_road" },
        );
      });
    }
  });

  return converted;
}
