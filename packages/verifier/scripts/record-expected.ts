/** The Expected_Outcomes of Requirement 12, criterion 2, for the seven recorded lines. */
export type Expected = Readonly<{
  cited: string;
  status: number;
  clusterId: string | null;
  outcome: string;
}>;

export const EXPECTED: Readonly<Record<string, Expected>> = {
  "556 U.S. 662": {
    cited: "Henderson v. Pacific Housing Authority",
    status: 200,
    clusterId: "145875",
    outcome: "wrong_case",
  },
  "925 F.3d 1339": {
    cited: "Varghese v. China Southern Airlines Co., Ltd.",
    status: 404,
    clusterId: null,
    outcome: "not_found",
  },
  "905 F. Supp. 2d 121": {
    cited: "Petersen v. Iran Air",
    status: 200,
    clusterId: "2661490",
    outcome: "wrong_case",
  },
  "174 F.3d 366": {
    cited: "Miller v. United Airlines, Inc.",
    status: 200,
    clusterId: "3011108",
    outcome: "wrong_case",
  },
  "516 F.3d 1237": {
    cited: "Zicherman v. Korean Air Lines Co., Ltd.",
    status: 404,
    clusterId: null,
    outcome: "not_found",
  },
  "516 U.S. 217": {
    cited: "Zicherman v. Korean Air Lines Co.",
    status: 200,
    clusterId: "117990",
    outcome: "verified",
  },
  "501 U.S. 32": {
    cited: "Chambers v. NASCO, Inc.",
    status: 200,
    clusterId: "112616",
    outcome: "verified",
  },
};
