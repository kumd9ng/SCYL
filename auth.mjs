import { createClient } from '@supabase/supabase-js';
import { mountAccount } from './lib/account-ui.mjs';
import { mountAuthPage } from './lib/auth-page.mjs';

const config = typeof __SCYL_ACCOUNT_CONFIG__ !== 'undefined' ? __SCYL_ACCOUNT_CONFIG__ : null;
mountAuthPage({ config, createClient, mountAccount });
