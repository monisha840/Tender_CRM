/** Subcontractor masters (shared by the party seed and work-order table). */
export interface SubSeed {
  id: string;
  name: string;
  region: "cg" | "mh" | "south" | "delhi";
  /** Plant state of its base, for the party address. */
  city: string;
  state: string;
  pan: string;
  gstin: string;
  contact: string;
  phone: string;
  trade: string;
  labour?: boolean;
}

export const SUBS: SubSeed[] = [
  { id: "1", name: "Deccan Civil Works", region: "south", city: "Raichur", state: "st_ka", pan: "AAFCD2210L", gstin: "29AAFCD2210L1ZN", contact: "Basavaraj Patil", phone: "98450 11021", trade: "Civil" },
  { id: "2", name: "Raichur Manpower Services", region: "south", city: "Raichur", state: "st_ka", pan: "AAHFR5532E", gstin: "29AAHFR5532E1Z8", contact: "Shivakumar Reddy", phone: "98450 11022", trade: "Stone Picking", labour: true },
  { id: "3", name: "Coastal Coatings & Painters", region: "south", city: "Chennai", state: "st_tn", pan: "AAGFC7783H", gstin: "33AAGFC7783H1ZV", contact: "Rajendran M", phone: "98410 11023", trade: "Painting" },
  { id: "4", name: "Madras Scaffolding Services", region: "south", city: "Chennai", state: "st_tn", pan: "AAJFM1904D", gstin: "33AAJFM1904D1ZP", contact: "Elango S", phone: "98410 11024", trade: "Scaffolding" },
  { id: "5", name: "Korba Coating & Painting Co.", region: "cg", city: "Korba", state: "st_cg", pan: "AAFFK4421B", gstin: "22AAFFK4421B1Z6", contact: "Mahesh Sahu", phone: "98931 40025", trade: "Painting" },
  { id: "6", name: "Chhattisgarh Civil & Allied Works", region: "cg", city: "Bilaspur", state: "st_cg", pan: "AAECC3387N", gstin: "22AAECC3387N1ZT", contact: "Suresh Rathore", phone: "98270 51426", trade: "Civil" },
  { id: "7", name: "Maa Kali Manpower Services", region: "cg", city: "Korba", state: "st_cg", pan: "ABCPM5521L", gstin: "22ABCPM5521L1ZA", contact: "Kamta Prasad", phone: "97550 22190", trade: "Stone Picking", labour: true },
  { id: "8", name: "Bhilai Steel Erectors", region: "cg", city: "Bhilai", state: "st_cg", pan: "AAGFB8812K", gstin: "22AAGFB8812K1ZC", contact: "Rakesh Dubey", phone: "98271 40027", trade: "Steel Erection" },
  { id: "9", name: "Basalt Linings Installers", region: "mh", city: "Nagpur", state: "st_mh", pan: "AAJFB6609Q", gstin: "27AAJFB6609Q1ZL", contact: "Anand Kulkarni", phone: "98220 61028", trade: "Pipeline Laying" },
  { id: "10", name: "Nagpur Civil Constructions", region: "mh", city: "Nagpur", state: "st_mh", pan: "AAFFN2278R", gstin: "27AAFFN2278R1ZG", contact: "Tanaji Bhosale", phone: "98900 18734", trade: "Civil" },
  { id: "11", name: "Vidarbha Manpower Services", region: "mh", city: "Nagpur", state: "st_mh", pan: "AAHFV3345T", gstin: "27AAHFV3345T1ZW", contact: "Ravindra Wankhede", phone: "98223 61045", trade: "Stone Picking", labour: true },
  { id: "12", name: "Utkal Industrial Painters", region: "delhi", city: "Angul", state: "st_od", pan: "AAFFU7714G", gstin: "21AAFFU7714G1ZD", contact: "Prasanna Sahoo", phone: "94370 21030", trade: "Painting" },
  { id: "13", name: "Eastern Stone Picking Contractors", region: "delhi", city: "Asansol", state: "st_wb", pan: "AAJFE1186M", gstin: "19AAJFE1186M1ZH", contact: "Biswajit Mondal", phone: "98320 21031", trade: "Stone Picking", labour: true },
  { id: "14", name: "Haryana Industrial Coatings", region: "delhi", city: "Panipat", state: "st_hr", pan: "AAGFH9902C", gstin: "06AAGFH9902C1ZS", contact: "Sunil Dahiya", phone: "98120 41032", trade: "Painting" },
];

export interface WorkOrderSpec {
  id: string;
  sub: string;
  /** Project key (see projects.ts). */
  project: string;
  trade: string;
  scope: string;
  valueRupees: number;
  /** Status of the newest bill. */
  lastBill: "SUBMITTED" | "APPROVED";
  penalty?: boolean;
}

/** Assignments per project. The ₹50 L Raichur package (p10) has Civil, Stone Picking and Painting subcontractors. */
export const WORK_ORDERS: WorkOrderSpec[] = [
  { id: "1", sub: "7", project: "p1_ntpc_stone", trade: "Stone Picking", scope: "Supply of stone pickers for three shifts on coal conveyors, CHP", valueRupees: 6_000_000, lastBill: "SUBMITTED" },
  { id: "2", sub: "5", project: "p2_cspgcl_paint", trade: "Painting", scope: "Blasting and painting of Unit 3 boiler structure, lower zone", valueRupees: 3_000_000, lastBill: "APPROVED" },
  { id: "3", sub: "9", project: "p3_mspgcl_cbp", trade: "Pipeline Laying", scope: "Laying, alignment and jointing of cast basalt lined pipeline", valueRupees: 20_000_000, lastBill: "SUBMITTED" },
  { id: "4", sub: "10", project: "p3_mspgcl_cbp", trade: "Civil", scope: "Pipe supports and trench works", valueRupees: 6_000_000, lastBill: "APPROVED" },
  { id: "5", sub: "11", project: "p4_mspgcl_stone", trade: "Stone Picking", scope: "Supply of manpower for coal conveyors, Koradi CHP", valueRupees: 15_000_000, lastBill: "APPROVED" },
  { id: "6", sub: "4", project: "p5_tangedco_scaff", trade: "Scaffolding", scope: "Scaffolding for boiler and ESP maintenance", valueRupees: 6_000_000, lastBill: "SUBMITTED" },
  { id: "7", sub: "3", project: "p5_tangedco_scaff", trade: "Painting", scope: "Painting of ESP casing and boiler structure", valueRupees: 4_300_000, lastBill: "APPROVED" },
  { id: "8", sub: "8", project: "p6_ntpc_steel", trade: "Steel Erection", scope: "Erection of conveyor gallery structural steel", valueRupees: 22_000_000, lastBill: "APPROVED", penalty: true },
  { id: "9", sub: "5", project: "p6_ntpc_steel", trade: "Painting", scope: "Surface treatment and painting of gallery steel", valueRupees: 4_500_000, lastBill: "APPROVED" },
  { id: "10", sub: "6", project: "p6_ntpc_steel", trade: "Civil", scope: "Foundations for gallery supports", valueRupees: 6_000_000, lastBill: "SUBMITTED" },
  { id: "11", sub: "10", project: "p7_mppgcl_civil", trade: "Civil", scope: "Repair of CHP foundations and drains", valueRupees: 6_500_000, lastBill: "APPROVED" },
  { id: "12", sub: "12", project: "p8_nalco_paint", trade: "Painting", scope: "Blasting and coating of cooling tower shell", valueRupees: 9_000_000, lastBill: "APPROVED" },
  { id: "13", sub: "13", project: "p9_dvc_stone", trade: "Stone Picking", scope: "Supply of stone pickers and coal sizing crew", valueRupees: 5_500_000, lastBill: "SUBMITTED" },
  { id: "14", sub: "1", project: "p10_kpcl_pkg", trade: "Civil", scope: "Civil repair of ash handling area floors and drains", valueRupees: 1_200_000, lastBill: "APPROVED" },
  { id: "15", sub: "2", project: "p10_kpcl_pkg", trade: "Stone Picking", scope: "Stone picking manpower for ash handling conveyors", valueRupees: 1_000_000, lastBill: "SUBMITTED" },
  { id: "16", sub: "3", project: "p10_kpcl_pkg", trade: "Painting", scope: "Painting of ash handling structures", valueRupees: 800_000, lastBill: "APPROVED" },
  { id: "17", sub: "14", project: "p11_iocl_paint", trade: "Painting", scope: "Blasting and painting of storage tanks and pipe racks", valueRupees: 4_300_000, lastBill: "APPROVED" },
];

/** Stone-picking manpower is a labour cost, everything else a subcontract cost. */
export const woCategory = (trade: string): "ec_labour" | "ec_subcontract" => (trade === "Stone Picking" ? "ec_labour" : "ec_subcontract");
