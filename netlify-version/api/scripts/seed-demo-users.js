/**
 * Script to seed demo users for the Interactive English Tutor application
 * This script creates demo accounts using the Supabase Admin API
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://opmxkafxsmelgaynrwsa.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wbXhrYWZ4c21lbGdheW5yd3NhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc0MTcyOSwiZXhwIjoyMDcyMzE3NzI5fQ.yhNEOGbZRkQiANbsI4B2w71HA_cfem1KYVoXzhDx71M';

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Demo users data
const demoUsers = [
  {
    email: 'child@demo.com',
    password: 'password123',
    full_name: 'Demo Child',
    role: 'child',
    age: 8,
    grade_level: '3rd Grade',
    parent_email: 'parent@demo.com'
  },
  {
    email: 'parent@demo.com',
    password: 'password123',
    full_name: 'Demo Parent',
    role: 'parent',
    age: null,
    grade_level: null,
    parent_email: null
  },
  {
    email: 'admin@demo.com',
    password: 'password123',
    full_name: 'Demo Admin',
    role: 'admin',
    age: null,
    grade_level: null,
    parent_email: null
  }
];

async function seedDemoUsers() {
  console.log('Starting demo user seeding...');
  
  try {
    // First, create parent user
    const parentUser = demoUsers.find(user => user.role === 'parent');
    console.log(`Creating parent user: ${parentUser.email}`);
    
    const { data: parentAuthData, error: parentAuthError } = await supabase.auth.admin.createUser({
      email: parentUser.email,
      password: parentUser.password,
      email_confirm: true
    });
    
    if (parentAuthError) {
      console.error('Error creating parent auth user:', parentAuthError);
      return;
    }
    
    console.log('Parent auth user created:', parentAuthData.user.id);
    
    // Create parent profile
    const { data: parentProfileData, error: parentProfileError } = await supabase
      .from('users')
      .insert({
        id: parentAuthData.user.id,
        email: parentUser.email,
        full_name: parentUser.full_name,
        role: parentUser.role,
        age: parentUser.age,
        grade_level: parentUser.grade_level,
        parent_id: null
      })
      .select()
      .single();
    
    if (parentProfileError) {
      console.error('Error creating parent profile:', parentProfileError);
      return;
    }
    
    console.log('Parent profile created successfully');
    
    // Create admin user
  const adminUser = demoUsers.find(user => user.role === 'admin');
  console.log(`Creating admin user: ${adminUser.email}`);
    
    const { data: adminAuthData, error: adminAuthError } = await supabase.auth.admin.createUser({
    email: adminUser.email,
    password: adminUser.password,
      email_confirm: true
    });
    
    if (adminAuthError) {
    console.error('Error creating admin auth user:', adminAuthError);
    return;
  }

  console.log('Admin auth user created:', adminAuthData.user.id);
    
    // Create admin profile
  const { data: adminProfileData, error: adminProfileError } = await supabase
    .from('users')
    .insert({
      id: adminAuthData.user.id,
      email: adminUser.email,
      full_name: adminUser.full_name,
      role: adminUser.role,
      age: adminUser.age,
      grade_level: adminUser.grade_level,
        parent_id: null
      })
      .select()
      .single();
    
    if (adminProfileError) {
    console.error('Error creating admin profile:', adminProfileError);
    return;
  }

  console.log('Admin profile created successfully');
    
    // Create child user
    const childUser = demoUsers.find(user => user.role === 'child');
    console.log(`Creating child user: ${childUser.email}`);
    
    const { data: childAuthData, error: childAuthError } = await supabase.auth.admin.createUser({
      email: childUser.email,
      password: childUser.password,
      email_confirm: true
    });
    
    if (childAuthError) {
      console.error('Error creating child auth user:', childAuthError);
      return;
    }
    
    console.log('Child auth user created:', childAuthData.user.id);
    
    // Create child profile with parent_id
    const { data: childProfileData, error: childProfileError } = await supabase
      .from('users')
      .insert({
        id: childAuthData.user.id,
        email: childUser.email,
        full_name: childUser.full_name,
        role: childUser.role,
        age: childUser.age,
        grade_level: childUser.grade_level,
        parent_id: parentAuthData.user.id
      })
      .select()
      .single();
    
    if (childProfileError) {
      console.error('Error creating child profile:', childProfileError);
      return;
    }
    
    console.log('Child profile created successfully');
    
    // Verify all users were created
    const { data: allUsers, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .in('email', ['child@demo.com', 'parent@demo.com', 'admin@demo.com']);
    
    if (fetchError) {
      console.error('Error fetching created users:', fetchError);
      return;
    }
    
    console.log('\n=== Demo Users Created Successfully ===');
    allUsers.forEach(user => {
      console.log(`${user.role.toUpperCase()}: ${user.email} (${user.full_name})`);
    });
    
    console.log('\n=== Login Credentials ===');
    console.log('Child: child@demo.com / password123');
    console.log('Parent: parent@demo.com / password123');
    console.log('Admin: admin@demo.com / password123');
    
  } catch (error) {
    console.error('Unexpected error during seeding:', error);
  }
}

// Run the seeding script
seedDemoUsers().then(() => {
  console.log('Demo user seeding completed.');
  process.exit(0);
}).catch((error) => {
  console.error('Demo user seeding failed:', error);
  process.exit(1);
});