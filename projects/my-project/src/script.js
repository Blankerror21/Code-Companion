document.getElementById('btnSubmit').addEventListener('click', function(event) {
  event.preventDefault();

  var name = document.getElementById('nameInput').value;
  var email = document.getElementById('emailInput').value;

  if (name === '') {
    alert('Please enter a name.');
    return;
  }

  if (email === '' || !/^[^\n\r\f].*@.*$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  console.log('Form submitted successfully!');
console.log('Name:', name);
console.log('Age:', age);
});