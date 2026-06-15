const dcmjsDimse = require('dcmjs-dimse');
const { Client } = dcmjsDimse;
const { CFindRequest } = dcmjsDimse.requests;
const { Status } = dcmjsDimse.constants;

const client = new Client();
const request = CFindRequest.createStudyFindRequest({
  PatientID: '',
  PatientName: '',
  StudyInstanceUID: '',
});
request.on('response', response => {
  if (response.getStatus() === Status.Pending && response.hasDataset()) {
    console.log('Datos de la respuesta:', response.getDataset());
  } else {
    console.log('Estado de la respuesta:', response.getStatus());
  }
});
client.addRequest(request);
client.on('networkError', e => {
  console.log('Network error: ', e);
});
client.send('200.105.143.202', 11112, 'Mac', 'MAYU');
