// extension/config.js  — REPLACE existing config.js with this
// Added: SMS_PORTAL_URL for PtclOrderSMS.aspx endpoints

export const SUPABASE_URL = "https://efrnsluzwyhqkqfevaqe.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcm5zbHV6d3locWtxZmV2YXFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTc4ODMsImV4cCI6MjA5NDgzMzg4M30.-YZVWlRL48_ToArJnYPEBYi2XH5RTsx8JYmarohFiJw";

// Existing order search portal
export const DEFAULT_PORTAL_URL =
  "https://cops.ptml.pk/csportal/net/ptcl/PTCL_Credit_Verification_Report_New.aspx/Get_Records";

// SMS portal — base URL (methods appended in background.js)
export const SMS_PORTAL_URL =
  "https://cops.ptml.pk/csportal/net/ptcl/PtclOrderSMS.aspx";
