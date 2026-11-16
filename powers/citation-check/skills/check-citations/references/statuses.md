# Statuses and codes

Each citation gets one status from the checker, and each status has one code. The codes are the ones in the Reveal Codes pane.

| Status (`lookup_citations`) | Code    | What it means                                                                                                                |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `verified`                  | `CIT ✓` | CourtListener resolved the citation to exactly one case, and the case name matches the name the document gives.              |
| `wrong_case`                | `CIT ≠` | CourtListener resolved the citation to exactly one case, but that case has a different name from the one the document gives. |
| `not_found`                 | `CIT ✘` | CourtListener has no case at that citation.                                                                                  |
| `ambiguous`                 | `CIT ?` | More than one case could match. The result lists the candidates.                                                             |
| `unchecked`                 | `CIT …` | Not checked yet, could not be checked, or a short form such as `Id.` with no earlier citation to refer to.                   |

| Status (`check_quote`) | Code    | What it means                                                                                      |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `match`                | `QUO ✓` | The quotation appears word for word in the opinion, ignoring differences in white space.           |
| `mismatch`             | `QUO ✘` | The quotation does not appear in the opinion. `prefixLength` is how many leading characters match. |
| `unchecked`            | `QUO …` | The opinion text was not available, so the quotation was not checked.                              |

Only `CIT ✓` and `QUO ✓` pass. Every other code is a failure to report.

In fixtures mode, `not_found` means only that the citation is not in the recorded set. It does not show that the case does not exist.
