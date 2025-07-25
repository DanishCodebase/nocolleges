"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { submitAdmissionQuery } from "@/lib/crm";
import { toast } from "sonner";
import { getAllStates, getCitiesForState } from "@/lib/stateData";

const formFields = [
  {
    name: "name",
    label: "Name",
    type: "text",
    placeholder: "Enter your name",
    required: true,
    validation: (value) => value.trim().length >= 2,
    errorMessage: "Name must be at least 2 characters long",
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "Enter your email",
    required: true,
    validation: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    errorMessage: "Please enter a valid email address",
  },
  {
    name: "phone",
    label: "Phone",
    type: "tel",
    placeholder: "Enter your phone number",
    required: true,
    validation: (value) => /^[6-9][0-9]{9}$/.test(value),
    errorMessage:
      "Please enter a valid 10-digit phone number starting with 6, 7, 8, or 9",
  },
  {
    name: "state",
    label: "State",
    type: "select",
    placeholder: "Select your state",
    required: true,
    validation: (value) => value !== "",
    errorMessage: "Please select a state",
    options: getAllStates(),
  },
  {
    name: "city",
    label: "City",
    type: "select",
    placeholder: "Select your city",
    required: true,
    validation: (value) => value !== "",
    errorMessage: "Please select a city",
    options: [], // Will be populated based on selected state
  },
];

export default function AdmissionFormPopup({
  utmParams,
  courseId,
  pageName,
  endpoint,
  title = "Apply Now",
  onSuccess,
}) {
  const initialFormData = {
    name: "",
    email: "",
    phone: "",
    coursesid: courseId,
    state: "",
    city: "",
    ...(pageName !== "mca" && { page: pageName }), // Only add page field for non-MCA forms
  };

  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cities, setCities] = useState([]);

  const handleChange = (e) => {
    let { name, value } = e.target;

    if (name === "name") {
      value = value.replace(/[^a-zA-Z\s]/g, "");
    } else if (name === "phone") {
      value = value.replace(/[^0-9]/g, "");
      if (value.length > 10) {
        value = value.slice(0, 10);
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));

    if (name === "state") {
      // Reset city when state changes
      setFormData((prev) => ({ ...prev, city: "" }));
      // Get cities for selected state
      const stateCities = getCitiesForState(value);
      setCities(stateCities);
    }
  };

  const validateField = (name, value) => {
    const field = formFields.find((f) => f.name === name);
    if (!field) return "";
    if (field.required && !value) return `${field.label} is required`;
    if (value && field.validation && !field.validation(value)) {
      return field.errorMessage;
    }
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate all fields
    const newErrors = {};
    formFields.forEach((field) => {
      const error = validateField(field.name, formData[field.name]);
      if (error) newErrors[field.name] = error;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error("Please fill in all required fields correctly.");
      return;
    }

    // Frontend check for duplicate phone number using localStorage
    let submittedPhoneNumbers =
      JSON.parse(localStorage.getItem("submittedPhoneNumbers")) || [];
    if (submittedPhoneNumbers.includes(formData.phone)) {
      toast.warning(
        "This phone number has already been used to submit a query during this session."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const sanitizedFormData = {
        ...formData,
        city: formData.city.replace(/\s/g, ""),
        ...(pageName !== "mca" && { page: pageName }), // Only add page field for non-MCA forms
      };

      // Submit to CRM
      const crmResult = await submitAdmissionQuery(
        sanitizedFormData,
        utmParams
      );

      // Submit to Google Sheets
      const sheetsResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...sanitizedFormData,
          campaign: utmParams?.campaign || utmParams?.utm_campaign,
          utm_source: "Stealth",
          utm_medium: utmParams?.utm_medium,
          utm_term: utmParams?.utm_term,
          utm_content: utmParams?.utm_content,
        }),
      });

      const sheetsData = await sheetsResponse.json();

      // Handle success case
      if (crmResult.success || sheetsData.success) {
        toast.success("Form submitted successfully!");
        if (!submittedPhoneNumbers.includes(formData.phone)) {
          submittedPhoneNumbers.push(formData.phone);
          localStorage.setItem(
            "submittedPhoneNumbers",
            JSON.stringify(submittedPhoneNumbers)
          );
        }
        setFormData(initialFormData);
        setErrors({});
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.href = "/thankyou.html";
        }
      } else {
        // Handle error case
        if (sheetsData.isDuplicate) {
          toast.error(
            "This phone number has already been used to submit an inquiry."
          );
          if (!submittedPhoneNumbers.includes(formData.phone)) {
            submittedPhoneNumbers.push(formData.phone);
            localStorage.setItem(
              "submittedPhoneNumbers",
              JSON.stringify(submittedPhoneNumbers)
            );
          }
        } else {
          toast.error("Failed to submit form. Please try again.");
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred. Please try again.");
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePhoneBlur = () => {
    const phone = formData.phone;
    if (/^[6-9][0-9]{9}$/.test(phone)) {
      let submittedPhoneNumbers =
        JSON.parse(localStorage.getItem("submittedPhoneNumbers")) || [];
      if (submittedPhoneNumbers.includes(phone)) {
        toast.warning(
          "Note: This phone number may have already been used in this session."
        );
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      {formFields.map((field) => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
            {field.required && <span className="text-red-500">*</span>}
          </label>
          {field.type === "select" ? (
            <select
              name={field.name}
              value={formData[field.name]}
              onChange={handleChange}
              className={`w-full p-3 rounded-lg border ${
                errors[field.name] ? "border-red-500" : "border-gray-200"
              } bg-white focus:outline-none focus:border-cusGreen focus:ring-1 focus:ring-cusGreen text-sm transition-all duration-200`}
              required={field.required}
            >
              <option value="">{field.placeholder}</option>
              {field.name === "city" && cities.length > 0
                ? cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))
                : field.options.map((option) => (
                    <option
                      key={typeof option === "object" ? option.value : option}
                      value={typeof option === "object" ? option.value : option}
                    >
                      {typeof option === "object" ? option.label : option}
                    </option>
                  ))}
            </select>
          ) : (
            <input
              type={field.type}
              name={field.name}
              value={formData[field.name]}
              onChange={handleChange}
              placeholder={field.placeholder}
              className={`w-full p-3 rounded-lg border ${
                errors[field.name] ? "border-red-500" : "border-gray-200"
              } bg-white focus:outline-none focus:border-cusGreen focus:ring-1 focus:ring-cusGreen text-sm transition-all duration-200`}
              required={field.required}
              onBlur={field.name === "phone" ? handlePhoneBlur : undefined}
            />
          )}
          {errors[field.name] && (
            <p className="text-red-500 text-sm mt-1">{errors[field.name]}</p>
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full p-3 bg-gradient-to-r from-green-700 to-green-400 text-white rounded-lg hover:shadow-lg transition-all duration-300 text-sm font-medium mt-2 flex items-center justify-center gap-2 group disabled:opacity-70"
      >
        {isSubmitting ? "Submitting..." : "Submit Query"}
        <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
    </form>
  );
}
