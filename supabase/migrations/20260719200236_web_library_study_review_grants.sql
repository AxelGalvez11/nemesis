-- Review history is append-only to browser clients. The SECURITY INVOKER grade
-- function needs INSERT and the heatmap needs SELECT; direct edits/deletes do
-- not belong to the client surface.
revoke update, delete on public.study_review_logs from authenticated;
