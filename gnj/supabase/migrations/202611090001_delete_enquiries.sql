grant delete on public.enquiries to authenticated;

create policy "Only owners delete enquiries"
  on public.enquiries for delete to authenticated
  using ((select public.is_admin()));
