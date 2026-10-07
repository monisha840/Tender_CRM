import { percentOf } from "@/lib/money";
import { addDays, DEMO_TODAY } from "@/lib/dates";
import type { ApprovalStatus, Id, IsoDate, Money, TechnicalResult } from "@/types";
import { PROJECT_SPECS, TENDER_SPECS, type TenderSpec } from "./catalog";
import { docTypeId, portalId, SERVICE_LINES, serviceLineId, stageId, tenderTypeId, type StageKey } from "./masters";
import { employeeIdOfUser, ORG_SHORT, userId } from "./org";
import { at, dayOffset, financialYear, lakh, meta, pad, rupees, RegionKey, type RegionKeyName, type SeedCtx } from "./helpers";

const RH: Record<RegionKeyName, string> = { cg: "rh_cg", mh: "rh_mh", south: "rh_south", delhi: "rh_delhi" };
export const REGION_GST: Record<RegionKeyName, string> = { cg: "gst_cg", mh: "gst_mh", south: "gst_tn", delhi: "gst_dl" };
const BANKS = ["State Bank of India", "Indian Overseas Bank", "HDFC Bank", "Canara Bank", "Bank of Baroda"];
const COMPETITORS = [
  "Sri Balaji Industrial Services", "Hindustan Coatings & Services", "Vishwakarma Engineering Works", "Triveni Manpower Solutions",
  "Ambika Industrial Contractors", "Bharat Scaffolding Co.", "Omkar Infra & Services", "Gayatri Enterprises",
];

/** Pipeline used to derive each tender's stage history. */
const PATH: Record<StageKey, StageKey[]> = {
  NEW: ["NEW"],
  UNDER_EVALUATION: ["NEW", "UNDER_EVALUATION"],
  BID_PREPARING: ["NEW", "UNDER_EVALUATION", "BID_PREPARING"],
  SUBMITTED: ["NEW", "UNDER_EVALUATION", "BID_PREPARING", "SUBMITTED"],
  WON: ["NEW", "UNDER_EVALUATION", "BID_PREPARING", "SUBMITTED", "WON"],
  LOST: ["NEW", "UNDER_EVALUATION", "BID_PREPARING", "SUBMITTED", "LOST"],
};
/** Day offsets from the submission deadline at which each stage was entered. */
const STAGE_AT: Record<StageKey, number> = { NEW: -21, UNDER_EVALUATION: -17, BID_PREPARING: -15, SUBMITTED: -1, WON: 16, LOST: 16 };
/** Post-result milestones (days after the submission deadline). */
const LOA_AT = 28;
const AGREEMENT_AT = 43;
const CONVERTED_AT = 50;

export interface ConvertedTender {
  key: string;
  tenderId: Id;
  title: string;
  organisationId: Id;
  regionKey: RegionKeyName;
  regionId: Id;
  siteId: Id | null;
  serviceLineId: Id;
  gstId: Id;
  ownerId: Id;
  awardedAmount: Money;
  workOrderNo: string;
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

  TENDER_SPECS.forEach((s: TenderSpec, idx) => {
    const id = `tnd_${s.key}`;
    const path = PATH[s.stage];
    const has = (k: StageKey) => path.includes(k);
    const sl = SERVICE_LINES.find((l) => l.key === s.sl)!;
    const ownerKey = s.region === "cg" || s.region === "mh" ? "tender2" : "tender1";
    const gstId = REGION_GST[s.region];
    const estimate = lakh(s.est);
    const emdAmount = percentOf(estimate, 2);
    const tenderFee = rupees(s.est >= 500 ? 5900 : s.est >= 200 ? 2950 : 1180);
    const deadline = dayOffset(s.dl);
    const fy = financialYear(addDays(deadline, -21));
    const short = ORG_SHORT[s.org];
    const resultId = s.stage === "WON" ? "res_won" : s.stage === "LOST" ? "res_lost" : null;

    db.tenders.push({
      ...meta(id, at(clamp(s.dl - 21))),
      tenderNo: `${short}/NIT/${fy}/${pad(100 + idx * 3)}`,
      title: s.title,
      workDescription: `${s.title}. Scope: ${sl.scope}. Location: ${s.loc}.`,
      eligibility: sl.eligibility,
      serviceLineId: serviceLineId(s.sl),
      siteId: s.site ?? null,
      organisationId: s.org,
      regionId: RegionKey[s.region],
      location: s.loc,
      tenderTypeId: tenderTypeId(s.type),
      portalId: portalId(s.portal),
      sourceUrl: null,
      estimatedValue: estimate,
      emdAmount,
      tenderFee,
      publishedOn: addDays(deadline, -21),
      preBidAt: has("UNDER_EVALUATION") ? at(addDays(deadline, -14), "11:00") : null,
      submissionDeadlineAt: at(deadline, "15:00"),
      openingDate: addDays(deadline, 2),
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
        changedById: userId(stage === "BID_PREPARING" ? RH[s.region] : ownerKey),
        changedAt: at(clamp(s.dl + STAGE_AT[stage]), "10:30"),
        reason: null,
      });
    });

    // ---- GO / NO-GO decision (taken in "Under Evaluation") ----
    const approverKey = s.est > 500 ? "stalin" : RH[s.region];
    const requestId = `apr_gng_${s.key}`;
    if (has("UNDER_EVALUATION")) {
      const decided = has("BID_PREPARING");
      const status: ApprovalStatus = decided ? "APPROVED" : "PENDING";
      const decisionDate = clamp(s.dl + STAGE_AT.BID_PREPARING);
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
        submittedAt: at(clamp(s.dl + STAGE_AT.UNDER_EVALUATION), "12:00"),
        completedAt: decided ? at(decisionDate, "16:00") : null,
      });
      db.approvalSteps.push({
        ...meta(`${requestId}_s1`), requestId, sequence: 1, assignedUserId: userId(approverKey), status,
        dueAt: decided ? null : at(addDays(today, 2), "18:00"),
      });
      if (decided) {
        db.approvalActions.push({
          ...meta(`${requestId}_a1`), stepId: `${requestId}_s1`, actorId: userId(approverKey), action: "APPROVE",
          comment: "Approved to participate.", at: at(decisionDate, "16:00"),
        });
        db.goNoGoDecisions.push({
          ...meta(`gng_${s.key}`), tenderId: id, decision: "GO", decidedById: userId(approverKey), decidedAt: at(decisionDate, "16:00"),
          reason: "Eligibility met; manpower and equipment available in the region.", approvalRequestId: requestId,
        });
      }
    }

    // ---- Document checklist ----
    if (has("BID_PREPARING")) {
      const items: [string, number, boolean][] = [
        ["Company registration", 0, true], ["PAN card", 1, true], ["GST registration certificate", 2, true],
        ["EPF / ESI registration", 3, true], ["Solvency certificate", 4, true], ["Turnover certificate (CA)", 5, true],
        ["Experience certificates", 6, true], ["Affidavit / declaration", 7, true], ["Contract labour licence", 15, true],
        ["ISO / safety certificates", 16, true], ["Power of attorney", 8, false],
      ];
      items.forEach(([name, dt, mandatory], i) => {
        let status: "NOT_STARTED" | "IN_PROGRESS" | "READY" | "NA" = "READY";
        if (s.stage === "BID_PREPARING") {
          if (s.dl <= 3) status = name === "Experience certificates" ? "IN_PROGRESS" : "READY";
          else if (s.dl <= 9) status = i < 5 ? "READY" : i < 8 ? "IN_PROGRESS" : "NOT_STARTED";
          else status = i < 3 ? "READY" : i < 6 ? "IN_PROGRESS" : "NOT_STARTED";
        }
        if (!mandatory && s.stage !== "BID_PREPARING") status = "NA";
        db.tenderDocumentItems.push({
          ...meta(`tdi_${s.key}_${i + 1}`), tenderId: id, name, documentTypeId: docTypeId(dt), isMandatory: mandatory, status,
          assigneeId: employeeIdOfUser(i % 2 ? "legal" : ownerKey), dueDate: addDays(deadline, -3),
        });
      });
    }

    // ---- EMD ----
    const emdId = `si_emd_${s.key}`;
    const emdArranged = s.stage !== "NEW" && s.stage !== "UNDER_EVALUATION" && (s.stage !== "BID_PREPARING" || s.dl <= 6);
    if (emdArranged) {
      const mode = rng.pick(["DD", "BG", "ONLINE", "FDR"] as const);
      const refundPending = s.stage === "LOST" && s.dl > -200;
      const status =
        s.stage === "BID_PREPARING" ? "ARRANGED"
        : s.stage === "LOST" && !refundPending ? "REFUNDED"
        : s.stage === "WON" && s.phase === "CONVERTED" ? "ADJUSTED"
        : "SUBMITTED";
      const issue = addDays(deadline, -6);
      db.securityInstruments.push({
        ...meta(emdId), type: "EMD", tenderId: id, projectId: null, mode, amount: emdAmount, instrumentNo: `${mode}-${rng.int(100000, 999999)}`,
        bank: rng.pick(BANKS), issueDate: issue, expiryDate: addDays(deadline, 180), status,
      });
      db.securityInstrumentEvents.push({ ...meta(`sie_${s.key}_1`), securityInstrumentId: emdId, type: "ISSUED", amount: emdAmount, date: issue, reference: null });
      if (refundPending) {
        db.securityInstrumentEvents.push({
          ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "REFUND_REQUESTED", amount: emdAmount, date: addDays(deadline, 30), reference: "Letter to organisation",
        });
      } else if (status === "REFUNDED") {
        db.securityInstrumentEvents.push({ ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "REFUNDED", amount: emdAmount, date: addDays(deadline, 45), reference: "Refund credited" });
      } else if (status === "ADJUSTED") {
        db.securityInstrumentEvents.push({ ...meta(`sie_${s.key}_2`), securityInstrumentId: emdId, type: "ADJUSTED", amount: emdAmount, date: addDays(deadline, AGREEMENT_AT), reference: "Adjusted into PBG" });
      }
    }

    // ---- Bid, competitors, clarifications ----
    let quoted: Money | null = null;
    if (has("SUBMITTED") && s.pct !== undefined) {
      quoted = rupees(Math.round(s.est * 100000 * (1 + s.pct / 100)));
      const isWon = s.stage === "WON";
      const evaluated = isWon || s.stage === "LOST" || s.dl <= -5;
      const tech: TechnicalResult = !evaluated ? "PENDING" : s.techRejected ? "REJECTED" : "QUALIFIED";
      const ourRank = isWon ? 1 : s.stage === "LOST" ? (s.techRejected ? null : rng.int(2, 3)) : evaluated ? (s.dl <= -10 ? 1 : 2) : null;
      db.bids.push({
        ...meta(`bid_${s.key}`), tenderId: id, quotedAmount: quoted, percentVsEstimate: s.pct.toFixed(4), submittedAt: at(addDays(deadline, -1), "14:20"),
        technicalResult: tech, financialRank: ourRank, isL1: ourRank === 1, isFinal: true,
      });
      if (tech === "QUALIFIED" && (isWon || s.stage === "LOST" || s.dl <= -10 || s.dl <= -5)) {
        const q = s.est * 100000 * (1 + s.pct / 100);
        const rivals = rng.int(3, 4);
        for (let i = 0; i < rivals; i++) {
          const rank = i + 1 >= (ourRank ?? 99) ? i + 2 : i + 1;
          const above = ourRank === 1 || rank > (ourRank ?? 99);
          const amount = above ? q * (1 + rng.float(0.006, 0.04) * (i + 1)) : q * (1 - rng.float(0.008, 0.03));
          db.competitorBids.push({
            ...meta(`cb_${s.key}_${i + 1}`), tenderId: id, competitorName: COMPETITORS[(idx + i * 3) % COMPETITORS.length],
            amount: rupees(Math.round(amount)), rank, isL1: ourRank !== 1 && rank === 1,
          });
        }
      }
    }
    if (s.key === "p10_kpcl_pkg") {
      db.bidClarifications.push({
        ...meta("bc_p10_1"), bidId: "bid_p10_kpcl_pkg", request: "Submit experience certificates for civil, manpower and painting work separately.",
        requestedOn: addDays(deadline, 3), dueDate: addDays(deadline, 6), response: "Separate certificates for each service uploaded.", respondedOn: addDays(deadline, 5),
      });
    }
    if (s.key === "s4_mspgcl_steel") {
      db.bidClarifications.push({
        ...meta("bc_s4_1"), bidId: "bid_s4_mspgcl_steel", request: "Confirm fabrication facility location and capacity (MT per month).",
        requestedOn: addDays(today, -3), dueDate: addDays(today, 1), response: null, respondedOn: null,
      });
    }

    // ---- Award, conditions, PBG (won tenders only) ----
    if (s.stage === "WON" && s.phase && s.phase !== "NO_LOA" && quoted) {
      const proj = PROJECT_SPECS.find((p) => p.key === s.key);
      const isConverted = s.phase === "CONVERTED";
      const loaDate = addDays(deadline, LOA_AT);
      const agreementDate = addDays(deadline, AGREEMENT_AT);
      const completionDays = proj?.durationDays ?? 365;
      const convertedDate = addDays(deadline, CONVERTED_AT);
      const startDate = addDays(convertedDate, 7);
      const awardId = `award_${s.key}`;
      const workOrderNo = `${short}/${s.site ? s.site.replace("site_", "").toUpperCase().slice(0, 8) : "WO"}/${fy}/${pad(300 + idx * 7)}`;
      db.tenderAwards.push({
        ...meta(awardId), tenderId: id, loaNo: `${short}/LoA/${fy}/${pad(20 + idx)}`, loaDate, awardedAmount: quoted,
        agreementNo: isConverted ? `${short}/AGR/${fy}/${pad(10 + idx)}` : null, agreementDate: isConverted ? agreementDate : null,
        completionPeriodDays: completionDays, startDate: isConverted ? startDate : null, conditionsNote: "PBG at 5% of contract value within 15 days of LoA.",
      });
      db.awardConditions.push(
        { ...meta(`ac_${s.key}_1`), awardId, description: "Performance bank guarantee (5%) submitted", isMandatory: true, status: isConverted ? "MET" : "PENDING", dueDate: addDays(loaDate, 15) },
        { ...meta(`ac_${s.key}_2`), awardId, description: "Agreement signed on stamp paper", isMandatory: true, status: isConverted ? "MET" : "PENDING", dueDate: addDays(loaDate, 30) },
        { ...meta(`ac_${s.key}_3`), awardId, description: "Contractor's all-risk insurance and workmen compensation policy", isMandatory: false, status: isConverted ? "MET" : "PENDING", dueDate: addDays(loaDate, 30) },
      );
      db.securityInstruments.push({
        ...meta(`si_pbg_${s.key}`), type: "PBG", tenderId: id, projectId: isConverted ? `prj_${s.key}` : null, mode: "BG", amount: percentOf(quoted, 5),
        instrumentNo: `BG-${rng.int(100000, 999999)}`, bank: rng.pick(BANKS), issueDate: isConverted ? addDays(loaDate, 10) : null,
        expiryDate: s.key === "p2_cspgcl_paint" ? addDays(today, 25) : addDays(startDate, completionDays + 90), status: isConverted ? (proj?.completed ? "RELEASED" : "SUBMITTED") : "ARRANGED",
      });
      if (isConverted && proj?.completed) {
        db.securityInstrumentEvents.push({
          ...meta(`sie_pbg_${s.key}_1`), securityInstrumentId: `si_pbg_${s.key}`, type: "RELEASED", amount: percentOf(quoted, 5), date: addDays(startDate, completionDays + 45), reference: "Released after completion certificate",
        });
      }
      if (isConverted && proj) {
        converted.push({
          key: s.key, tenderId: id, title: s.title, organisationId: s.org, regionKey: s.region, regionId: RegionKey[s.region], siteId: s.site ?? null,
          serviceLineId: serviceLineId(s.sl), gstId, ownerId: userId(ownerKey), awardedAmount: quoted, workOrderNo, loaDate, agreementDate, convertedDate, startDate, completionDays,
        });
      }
    }

    // ---- Supporting documents (the Rs 50 lakh Raichur package) ----
    if (s.key === "p10_kpcl_pkg") {
      [
        ["Tender notice (NIT).pdf", 14, 842_113], ["Bid acknowledgement.pdf", 13, 120_552],
        ["Letter of Acceptance.pdf", 11, 210_330], ["Agreement.pdf", 12, 1_532_880],
      ].forEach(([fileName, dt, size], i) => {
        db.documents.push({
          ...meta(`doc_p10_${i + 1}`), storageKey: `tenders/p10/${i + 1}`, fileName: String(fileName), mime: "application/pdf", size: Number(size),
          documentTypeId: docTypeId(Number(dt)), version: 1, uploadedById: userId("tender1"),
        });
        db.documentLinks.push(
          { ...meta(`dl_p10_t${i + 1}`), documentId: `doc_p10_${i + 1}`, entityType: "TENDER", entityId: id },
          { ...meta(`dl_p10_p${i + 1}`), documentId: `doc_p10_${i + 1}`, entityType: "PROJECT", entityId: "prj_p10_kpcl_pkg" },
        );
      });
    }
  });

  return converted;
}
