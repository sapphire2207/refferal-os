# Sample Documents for Frontend Testing

This directory contains valid medical PDF documents formatted specifically for the testing flows in [`Frontend_Testing_Guide.md`](../Frontend_Testing_Guide.md).

All documents use standard PDF 1.4 binary structure with valid magic bytes (`%PDF-1.4`) that pass backend validation (`DocumentsService.validateFile`).

---

## Files Overview

| File Name | Intended Use / Testing Step | Document Type Dropdown | Candidate |
|---|---|---|---|
| **`Marcus_Vance_Clinical_Order.pdf`** | **Phase 2 (Step 2.2)**: Clinical Order upload | `Clinical Order` | Candidate A (Marcus Vance) |
| **`sample_clinical_order.pdf`** | Direct alias of Marcus Vance Clinical Order | `Clinical Order` | Any / Quick Test |
| **`Marcus_Vance_Insurance_Card.pdf`** | **Phase 2 (Step 2.2)**: Secondary document test | `Insurance Card` | Candidate A (Marcus Vance) |
| **`Elena_Rostova_Clinical_Order.pdf`** | **Phase 3 (Step 3.4)**: Attach missing order & re-submit | `Clinical Order` | Candidate B (Elena Rostova) |

---

## Instructions for Step 2.2 (Candidate A - Marcus Vance)

1. Open `/referrals/[id]` for **Marcus Vance**.
2. Click the **"Documents"** tab (second tab under the 6-gate stepper).
3. Under **Attached Clinical Documents**:
   - Click **"Choose File"** and select:
     ```
     e:\refferal-os-workflow\sample_docs\Marcus_Vance_Clinical_Order.pdf
     ```
     *(or drag-and-drop it into the file picker)*
   - In the **Document Type** dropdown, select: **`Clinical Order`**
   - Click the blue button: **"Upload & Extract"**
4. **Expected Result:**
   - Green toast: *"Document uploaded and queued for AI extraction"*.
   - The file appears in the document list with status `Pending Verification`.
   - The download icon allows downloading the uploaded file.

