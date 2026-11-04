ALTER TABLE public.buildings
    ADD COLUMN receipt_thank_you_template text,
    ADD COLUMN arrears_reminder_template text;

ALTER TABLE public.buildings
    ADD CONSTRAINT buildings_receipt_template_length_check
        CHECK (receipt_thank_you_template IS NULL OR char_length(receipt_thank_you_template) <= 180),
    ADD CONSTRAINT buildings_reminder_template_length_check
        CHECK (arrears_reminder_template IS NULL OR char_length(arrears_reminder_template) <= 500);

COMMENT ON COLUMN public.buildings.receipt_thank_you_template IS
    'Per-building receipt thank-you text; NULL means use a legacy device value or application default.';
COMMENT ON COLUMN public.buildings.arrears_reminder_template IS
    'Per-building arrears reminder template; NULL means use a legacy device value or application default.';
