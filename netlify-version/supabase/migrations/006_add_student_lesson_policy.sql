-- Add policy to allow students to view lesson plans assigned to them
CREATE POLICY "Students can view assigned lesson plans" ON lesson_plans
  FOR SELECT
  USING (
    auth.uid() = ANY(assigned_students::uuid[])
  );

-- Grant SELECT permission to authenticated users (students)
GRANT SELECT ON lesson_plans TO authenticated;