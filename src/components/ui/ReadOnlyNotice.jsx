import Alert from './Alert';

/** Shown instead of entry forms when the user may only view the page */
export default function ReadOnlyNotice() {
  return (
    <Alert variant="info">
      Bu sayfada yalnızca <b>görüntüleme</b> yetkiniz var: kayıtları görebilir ve Excel'e aktarabilirsiniz, ancak ekleyemez,
      değiştiremez veya silemezsiniz.
    </Alert>
  );
}
