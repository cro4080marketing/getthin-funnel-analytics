/**
 * Complete funnel page definitions for Get Thin MD Quiz
 * 55 live pages as defined in Embeddables
 */

export interface FunnelPageDefinition {
  pageNumber: number;
  pageKey: string;
  pageName: string;
  category: 'question' | 'interstitial' | 'social_proof' | 'health' | 'checkout' | 'conversion' | 'dq';
  isConversionPoint?: boolean;
  isPurchaseComplete?: boolean;
  isDisqualification?: boolean;
}

export const FUNNEL_PAGES: FunnelPageDefinition[] = [
  { pageNumber: 1, pageKey: 'current_height_and_weight', pageName: 'Current Height and Weight', category: 'question' },
  { pageNumber: 2, pageKey: 'bmi_goal_weight', pageName: 'BMI Goal Weight', category: 'question' },
  { pageNumber: 3, pageKey: 'bmi_goal_weight_dq', pageName: 'BMI Goal Weight (DQ)', category: 'dq', isDisqualification: true },
  { pageNumber: 4, pageKey: 'sex', pageName: 'Sex', category: 'question' },
  { pageNumber: 5, pageKey: 'initial_disqualifiers', pageName: 'Initial Disqualifiers', category: 'health' },
  { pageNumber: 6, pageKey: 'specific_effects', pageName: 'Specific Effects', category: 'question' },
  { pageNumber: 7, pageKey: 'main_priority', pageName: 'Main Priority', category: 'question' },
  { pageNumber: 8, pageKey: 'video_proof', pageName: 'Video Proof', category: 'social_proof' },
  { pageNumber: 9, pageKey: 'interstitial_magic_science', pageName: 'Interstitial: Magic Science', category: 'interstitial' },
  { pageNumber: 10, pageKey: 'female_social_proof', pageName: 'Female Social Proof', category: 'social_proof' },
  { pageNumber: 11, pageKey: 'male_social_proof', pageName: 'Male Social Proof', category: 'social_proof' },
  { pageNumber: 12, pageKey: 'how_glp1_works', pageName: 'How GLP-1 Works', category: 'interstitial' },
  { pageNumber: 13, pageKey: 'glp_motivation', pageName: 'GLP Motivation', category: 'question' },
  { pageNumber: 14, pageKey: 'pace', pageName: 'Pace', category: 'question' },
  { pageNumber: 15, pageKey: 'interstitial_works_for_me', pageName: 'Interstitial: Works For Me', category: 'interstitial' },
  { pageNumber: 16, pageKey: 'interstitial_i_want_faster', pageName: 'Interstitial: I Want Faster', category: 'interstitial' },
  { pageNumber: 17, pageKey: 'interstitial_too_fast', pageName: 'Interstitial: Too Fast', category: 'interstitial' },
  { pageNumber: 18, pageKey: 'sleep_overall', pageName: 'Sleep Overall', category: 'health' },
  { pageNumber: 19, pageKey: 'sleep_hours', pageName: 'Sleep Hours', category: 'health' },
  { pageNumber: 20, pageKey: 'female_social_proof_2', pageName: 'Female Social Proof 2', category: 'social_proof' },
  { pageNumber: 21, pageKey: 'male_social_proof_2', pageName: 'Male Social Proof 2', category: 'social_proof' },
  { pageNumber: 22, pageKey: 'dq_health_conditions', pageName: 'DQ Health Conditions', category: 'health' },
  { pageNumber: 23, pageKey: 'other_health_conditions', pageName: 'Other Health Conditions', category: 'health' },
  { pageNumber: 24, pageKey: 'clearance_required', pageName: 'Clearance Required', category: 'health' },
  { pageNumber: 25, pageKey: 'dq_health_conditions_by_bmi', pageName: 'DQ Health Conditions by BMI', category: 'health' },
  { pageNumber: 26, pageKey: 'heart_conditions', pageName: 'Heart Conditions', category: 'health' },
  { pageNumber: 27, pageKey: 'allergies', pageName: 'Allergies', category: 'health' },
  { pageNumber: 28, pageKey: 'taking_wl_meds', pageName: 'Taking WL Meds', category: 'health' },
  { pageNumber: 29, pageKey: 'taken_wl_meds', pageName: 'Taken WL Meds', category: 'health' },
  { pageNumber: 30, pageKey: 're_gaining_weight', pageName: 'Re-gaining Weight', category: 'question' },
  { pageNumber: 31, pageKey: 'glp_details', pageName: 'GLP Details', category: 'health' },
  { pageNumber: 32, pageKey: 'taken_opiate_meds', pageName: 'Taken Opiate Meds', category: 'health' },
  { pageNumber: 33, pageKey: 'surgeries', pageName: 'Surgeries', category: 'health' },
  { pageNumber: 34, pageKey: 'wl_programs', pageName: 'WL Programs', category: 'question' },
  { pageNumber: 35, pageKey: 'patient_willing_to', pageName: 'Patient Willing To', category: 'question' },
  { pageNumber: 36, pageKey: 'weight_changed', pageName: 'Weight Changed', category: 'question' },
  { pageNumber: 37, pageKey: 'social_proof', pageName: 'Social Proof', category: 'social_proof' },
  { pageNumber: 38, pageKey: 'avg_blood_pressure', pageName: 'Avg Blood Pressure', category: 'health' },
  { pageNumber: 39, pageKey: 'avg_resting_heart', pageName: 'Avg Resting Heart', category: 'health' },
  { pageNumber: 40, pageKey: 'current_medications', pageName: 'Current Medications', category: 'health' },
  { pageNumber: 41, pageKey: 'state_of_mind', pageName: 'State of Mind', category: 'question' },
  { pageNumber: 42, pageKey: 'further_info', pageName: 'Further Info', category: 'question' },
  { pageNumber: 43, pageKey: 'concerns', pageName: 'Concerns', category: 'question' },
  { pageNumber: 44, pageKey: 'date_of_birth', pageName: 'Date of Birth', category: 'question' },
  { pageNumber: 45, pageKey: 'medical_review', pageName: 'Medical Review', category: 'conversion', isConversionPoint: true },
  { pageNumber: 46, pageKey: 'lead_capture', pageName: 'Lead Capture', category: 'conversion', isConversionPoint: true },
  { pageNumber: 47, pageKey: 'medicine_match', pageName: 'Medicine Match', category: 'question' },
  { pageNumber: 48, pageKey: 'micro_medicine_match', pageName: 'Micro Medicine Match', category: 'question' },
  { pageNumber: 49, pageKey: 'submission_review', pageName: 'Submission Review', category: 'conversion' },
  { pageNumber: 50, pageKey: 'dq_page', pageName: 'Disqualification Page', category: 'dq', isDisqualification: true },
  { pageNumber: 51, pageKey: 'macro_checkout', pageName: 'Macro Checkout', category: 'checkout', isConversionPoint: true },
  { pageNumber: 52, pageKey: 'micro_checkout', pageName: 'Micro Checkout', category: 'checkout', isConversionPoint: true },
  { pageNumber: 53, pageKey: 'payment_successful', pageName: 'Payment Successful', category: 'conversion', isPurchaseComplete: true },
  { pageNumber: 54, pageKey: 'asnyc_confirmation_to_redirect', pageName: 'Async Confirmation', category: 'conversion', isPurchaseComplete: true },
  { pageNumber: 55, pageKey: 'calendar_page', pageName: 'Calendar Page', category: 'conversion', isPurchaseComplete: true },
];

// Helper to get page by key
export const getPageByKey = (key: string): FunnelPageDefinition | undefined => {
  return FUNNEL_PAGES.find(p => p.pageKey === key);
};

// Helper to get page by number
export const getPageByNumber = (num: number): FunnelPageDefinition | undefined => {
  return FUNNEL_PAGES.find(p => p.pageNumber === num);
};

// Get all purchase completion page keys
export const PURCHASE_COMPLETE_KEYS = FUNNEL_PAGES
  .filter(p => p.isPurchaseComplete)
  .map(p => p.pageKey);

// Get all disqualification page keys
export const DISQUALIFICATION_KEYS = FUNNEL_PAGES
  .filter(p => p.isDisqualification)
  .map(p => p.pageKey);

// Get all conversion point page keys
export const CONVERSION_POINT_KEYS = FUNNEL_PAGES
  .filter(p => p.isConversionPoint)
  .map(p => p.pageKey);

// Check if a page key indicates purchase completion
export const isPurchaseComplete = (pageKey: string): boolean => {
  return PURCHASE_COMPLETE_KEYS.includes(pageKey);
};

// Check if a page key indicates disqualification
export const isDisqualification = (pageKey: string): boolean => {
  return DISQUALIFICATION_KEYS.includes(pageKey);
};
